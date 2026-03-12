//go:build !windows

package main

// openFolderWindows ist nur unter Windows implementiert; unter anderen OS ein No-Op.
func openFolderWindows(dir string) error {
	return nil
}
