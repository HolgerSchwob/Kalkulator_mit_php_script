package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// Config holds agent configuration.
type Config struct {
	Port         int    `json:"port"`
	ListenHost   string `json:"listenHost"`
	APIKey       string `json:"apiKey"`
	NASBasePath  string `json:"nasBasePath"`
	SupabaseURL  string `json:"supabaseUrl"`
	AdminSecret  string `json:"adminSecret"`
}

func loadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var c Config
	if err := json.Unmarshal(data, &c); err != nil {
		return nil, err
	}
	if c.Port == 0 {
		c.Port = 41123
	}
	if c.ListenHost == "" {
		c.ListenHost = "127.0.0.1"
	}
	c.SupabaseURL = strings.TrimSuffix(c.SupabaseURL, "/")
	return &c, nil
}

var cfg *Config

func main() {
	configPath := "config.json"
	if p := os.Getenv("FILEAGENT_CONFIG"); p != "" {
		configPath = p
	}
	var err error
	cfg, err = loadConfig(configPath)
	if err != nil {
		log.Fatalf("Config laden: %v (siehe config.example.json)", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/open-folder", handleOpenFolder)
	mux.HandleFunc("/sync-order", handleSyncOrder)

	addr := fmt.Sprintf("%s:%d", cfg.ListenHost, cfg.Port)
	log.Printf("FileAgent startet auf %s (NAS: %s)", addr, cfg.NASBasePath)
	if err := http.ListenAndServe(addr, corsAndAuth(mux)); err != nil {
		log.Fatal(err)
	}
}

func corsAndAuth(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Agent-Key")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		if cfg.APIKey != "" {
			key := r.Header.Get("X-Agent-Key")
			if key == "" {
				key = r.URL.Query().Get("apiKey")
			}
			if key != cfg.APIKey {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
				return
			}
		}

		h.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// OpenFolderRequest expects orderNumber to open the order folder on NAS.
type OpenFolderRequest struct {
	OrderNumber string `json:"orderNumber"`
}

func handleOpenFolder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}

	var req OpenFolderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}
	req.OrderNumber = strings.TrimSpace(req.OrderNumber)
	if req.OrderNumber == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "orderNumber required"})
		return
	}

	dir := filepath.Join(cfg.NASBasePath, sanitizeOrderFolder(req.OrderNumber))
	_ = os.MkdirAll(dir, 0755) // Ordner anlegen falls nicht vorhanden, damit Explorer ihn öffnen kann
	if err := openFolder(dir); err != nil {
		log.Printf("open-folder: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"ok": "true", "path": dir})
}

func sanitizeOrderFolder(s string) string {
	// Nur sichere Zeichen für Ordnernamen
	var b strings.Builder
	for _, r := range s {
		if (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			b.WriteRune(r)
		}
	}
	out := b.String()
	if out == "" {
		return "Order"
	}
	return out
}

func openFolder(dir string) error {
	if runtime.GOOS == "windows" {
		return openFolderWindows(dir)
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		abs = dir
	}
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", abs)
	default:
		cmd = exec.Command("xdg-open", abs)
	}
	return cmd.Start()
}

// SyncOrderRequest can contain order_id (UUID) or order_number.
type SyncOrderRequest struct {
	OrderID     string `json:"orderId"`
	OrderNumber string `json:"orderNumber"`
}

type orderDetailResponse struct {
	Order        map[string]interface{}   `json:"order"`
	DownloadUrls map[string]string       `json:"downloadUrls"`
}

func handleSyncOrder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}

	var req SyncOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}
	req.OrderID = strings.TrimSpace(req.OrderID)
	req.OrderNumber = strings.TrimSpace(req.OrderNumber)
	if req.OrderID == "" && req.OrderNumber == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "orderId or orderNumber required"})
		return
	}

	// Call Supabase order-detail to get signed URLs
	body := map[string]string{}
	if req.OrderID != "" {
		body["order_id"] = req.OrderID
	} else {
		body["order_number"] = req.OrderNumber
	}
	bodyBytes, _ := json.Marshal(body)
	httpReq, err := http.NewRequest("POST", cfg.SupabaseURL+"/functions/v1/order-detail", bytes.NewReader(bodyBytes))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-admin-secret", cfg.AdminSecret)

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		msg, _ := io.ReadAll(resp.Body)
		writeJSON(w, resp.StatusCode, map[string]string{"error": string(msg)})
		return
	}

	var detail orderDetailResponse
	if err := json.NewDecoder(resp.Body).Decode(&detail); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Invalid response from Supabase"})
		return
	}

	orderNum, _ := detail.Order["order_number"].(string)
	if orderNum == "" {
		orderNum = req.OrderNumber
	}
	if orderNum == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "order_number not in response"})
		return
	}

	orderDir := filepath.Join(cfg.NASBasePath, sanitizeOrderFolder(orderNum))
	if err := os.MkdirAll(orderDir, 0755); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Ordner anlegen: " + err.Error()})
		return
	}

	saved := 0
	for key, url := range detail.DownloadUrls {
		if url == "" {
			continue
		}
		filename := key + ".bin"
		if key == "mainPdf" {
			filename = orderNum + ".pdf"
		} else if strings.HasPrefix(key, "svg_") {
			filename = strings.TrimPrefix(key, "svg_")
		}
		dstPath := filepath.Join(orderDir, filename)
		if err := downloadFile(url, dstPath); err != nil {
			log.Printf("Download %s: %v", key, err)
			continue
		}
		saved++
	}

	// In Supabase vermerken, dass Daten lokal gesichert wurden
	syncedAt := time.Now().UTC().Format(time.RFC3339)
	if orderID, _ := detail.Order["id"].(string); orderID != "" && cfg.AdminSecret != "" {
		updateBody := map[string]string{"order_id": orderID, "local_synced_at": syncedAt}
		updateBytes, _ := json.Marshal(updateBody)
		updateReq, _ := http.NewRequest("POST", cfg.SupabaseURL+"/functions/v1/update-order", bytes.NewReader(updateBytes))
		updateReq.Header.Set("Content-Type", "application/json")
		updateReq.Header.Set("x-admin-secret", cfg.AdminSecret)
		if updateResp, err := http.DefaultClient.Do(updateReq); err != nil {
			log.Printf("update-order (local_synced_at): %v", err)
		} else {
			if updateResp.StatusCode != http.StatusOK {
				body, _ := io.ReadAll(updateResp.Body)
				log.Printf("update-order returned %d: %s", updateResp.StatusCode, string(body))
			}
			updateResp.Body.Close()
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok": true, "path": orderDir, "filesSaved": saved, "orderNumber": orderNum, "syncedAt": syncedAt,
	})
}

func downloadFile(url, dstPath string) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	f, err := os.Create(dstPath)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, resp.Body)
	return err
}
