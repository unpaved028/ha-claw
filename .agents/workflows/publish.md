---
description: Wie man einen neuen Release von HA-Claw auf GitHub veröffentlicht
---

# Release veröffentlichen

Dieser Workflow automatisiert die Veröffentlichung eines neuen Releases auf GitHub.

1.  **Versionsnummer validieren**: Stelle sicher, dass der User die Versionsnummer für den neuen Release angegeben hat (z. B. `v0.6.3`). Wenn nicht, frage nach!
2.  **Dateien prüfen**: Überprüfe (oder frage den User, ob er es bereits getan hat), ob alle Versionsnummern in den folgenden Dateien aktualisiert wurden:
    -   `CLAUDE.md`
    -   `ha-claw/CHANGELOG.md`
    -   `ha-claw/config.yaml`
    -   (und ggf. `ha-claw/README.md` oder `ha-claw/DOCS.md`, falls sie Versionen enthalten)

// turbo
3.  **Dashboard bundlen**: Generiere die `dashboard.ts` aus den UI-Quelldateien. Dieser Schritt stellt sicher, dass alle UI-Änderungen in den Release einfließen.
    ```bash
    node .agents/workflows/bundle-dashboard.js
    ```

// turbo
4.  **TypeScript prüfen**: Stelle sicher, dass das Projekt fehlerfrei kompiliert.
    ```bash
    npm run check
    ```
    Falls Fehler auftreten: **STOPPEN** und den User informieren!

// turbo
5.  **Änderungen committen**: Führe die Git-Commands aus, um die Code-Änderungen inkl. Versions-Bump zu speichern. Ersetze `<VERSION>` durch die angegebene Version (z. B. `v0.6.3`).
    ```bash
    git add .
    git commit -m "chore: release <VERSION>"
    ```

// turbo
6.  **Git Tag erstellen**: Erstelle einen neuen Tag für die Version.
    ```bash
    git tag <VERSION>
    ```

// turbo
7.  **Pushen auf GitHub**: Lade die Änderungen und Tags auf GitHub hoch.
    ```bash
    git push origin main
    git push origin --tags
    ```

8.  (Optional) Falls das `gh` CLI installiert ist und ein formaler GitHub Release erstellt werden soll, kannst du dies mit `gh release create <VERSION> --generate-notes` tun.
9.  Zeige dem User eine Erfolgsmeldung, dass der Release nun gepublisht ist!
