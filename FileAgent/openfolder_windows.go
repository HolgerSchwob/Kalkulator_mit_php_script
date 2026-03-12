//go:build windows

package main

import (
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

const (
	explorerWindowClass = "CabinetWClass"
)

var (
	user32                    = syscall.NewLazyDLL("user32.dll")
	procEnumWindows           = user32.NewProc("EnumWindows")
	procGetClassNameW         = user32.NewProc("GetClassNameW")
	procGetWindowTextW        = user32.NewProc("GetWindowTextW")
	procSetForegroundWindow   = user32.NewProc("SetForegroundWindow")
	procSetWindowPos          = user32.NewProc("SetWindowPos")
	procBringWindowToTop      = user32.NewProc("BringWindowToTop")
)

// openFolderWindows öffnet den Ordner im Explorer und bringt das Fenster in den Vordergrund.
func openFolderWindows(dir string) error {
	abs, err := filepath.Abs(dir)
	if err != nil {
		abs = dir
	}
	// Explorer starten (cmd start öffnet zuverlässig UNC-Pfade)
	cmd := exec.Command("cmd", "/c", "start", "", abs)
	if err := cmd.Start(); err != nil {
		return err
	}
	// Kurz warten, bis das Fenster da ist
	time.Sleep(500 * time.Millisecond)
	// Fenster in den Vordergrund holen
	bringExplorerWindowToFront(abs)
	return nil
}

func bringExplorerWindowToFront(targetPath string) {
	folderName := filepath.Base(targetPath)
	if folderName == "" || folderName == "." {
		folderName = targetPath
	}
	var foundHWND syscall.Handle
	cb := syscall.NewCallback(func(hwnd syscall.Handle, lParam uintptr) uintptr {
		class := getClassName(hwnd)
		if class != explorerWindowClass {
			return 1
		}
		title := getWindowText(hwnd)
		if title == "" {
			return 1
		}
		if strings.Contains(title, folderName) {
			foundHWND = hwnd
			return 0
		}
		return 1
	})
	procEnumWindows.Call(cb, 0)
	if foundHWND != 0 {
		procSetForegroundWindow.Call(uintptr(foundHWND))
		procBringWindowToTop.Call(uintptr(foundHWND))
	}
}

func getClassName(hwnd syscall.Handle) string {
	buf := make([]uint16, 256)
	procGetClassNameW.Call(uintptr(hwnd), uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)))
	return syscall.UTF16ToString(buf)
}

func getWindowText(hwnd syscall.Handle) string {
	buf := make([]uint16, 512)
	procGetWindowTextW.Call(uintptr(hwnd), uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)))
	return syscall.UTF16ToString(buf)
}
