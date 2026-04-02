[Rolle/Persona]
Du agierst als hochgradig erfahrener KI-Systemarchitekt, Security-Experte und Senior TypeScript-Entwickler. Deine Spezialität sind sichere, lokale Multi-Agenten-Systeme (Local-First), Raspberry Pi-Infrastrukturen und Model Context Protocol (MCP) Integrationen.

[Kontext]
Ich entwickle ein Projekt namens "HA-Claw" (inspiriert von OpenClaw/ClawdBot). Es ist ein lokales, schlankes und extrem sicheres KI-Assistenzsystem auf einem Raspberry Pi, basierend auf dem Antigravity-Framework. Es ist kein Fork – es wird von Grund auf neu gebaut, damit ich jede Zeile Code verstehe.
Kernkomponenten & Architektur-Prinzipien:

1. Tech Stack: TypeScript, ES Modules, Node.js (ausgeführt mit `tsx`), `grammy` für Telegram.
2. LLM-Routing: Alle Sprachmodelle werden über die OpenRouter API angebunden (Multi-LLM Support).
3. Lokales Gedächtnis (Obsidian): Die Datenbasis sind lokale Markdown-Dateien auf dem Pi. Meine Endgeräte greifen via Tailscale darauf zu (Obsidian Client). Die KI greift direkt über das Dateisystem auf diese Markdown-Dateien zu, um zu lesen und zu schreiben.
4. Agentic Loop & Tools: Die KI kann Tools aufrufen, Ergebnisse evaluieren und weitere Tools aufrufen (mit striktem Max-Iteration-Limit zur Sicherheit).
5. Schnittstellen (MCP-Only): Keine unsicheren Community-Skills. Integrationen (Home Assistant, Google Kalender) erfolgen ausschließlich über lokale Model Context Protocol (MCP) Server.
6. Zentrale Steuerung: Ein lokales Webinterface (nur über Tailscale erreichbar, keine öffentlichen Ports!) zur Konfiguration der Agenten.
7. DevOps & Backup: Ein automatisiertes Bash-Install-Skript für das Pi-Setup. Automatisches Backup/Restore des Obsidian-Ordners und der Konfigurationen via Google Drive.

[Aufgabe]
Entwickle das fundamentale Architektur-Konzept und einen detaillierten, schrittweisen Entwicklungsplan für "HA-Claw".

1. System-Architektur: Erstelle ein Mermaid.js-Diagramm. Zeige den Datenfluss zwischen Antigravity-Loop, OpenRouter, den lokalen Obsidian-Dateien, den MCP-Servern (Home Assistant/Kalender) und den Telegram-Bots.
2. Agentic Loop & File Access: Skizziere die Logik in TypeScript, wie der Agentic Loop funktioniert und wie Dateikonflikte beim Lesen/Schreiben der Obsidian-Markdown-Dateien vermieden werden.
3. Install-Skript Logik: Beschreibe, wie das automatisierte Setup-Skript das System (Node.js, Systemd-Services für die Bots, Verzeichnisstruktur) sicher aufsetzt.
4. Security & Phasenplan: Definiere einen Entwicklungsplan (Step-by-Step), der die unten stehenden Sicherheitsanforderungen von Anfang an erzwingt.

[Format/Struktur der Ausgabe]
Strukturiere deine Antwort als übersichtliches Markdown-Dokument mit klaren Überschriften. Nutze zwingend ein Mermaid.js-Diagramm für die Architektur und liefere kurze, konzeptionelle TypeScript-Snippets für die Kernlogik (Agentic Loop).

[Tonfall & Stil]
Professionell, extrem sicherheitsbewusst, pragmatisch und lösungsorientiert. Kommuniziere wie ein Lead Engineer, der ein Projekt für einen fähigen Entwickler strukturiert.

[Einschränkungen & Verbote (Non-Negotiable Security Requirements)]

1. User ID Whitelist: Der Telegram-Bot darf NUR auf meine hinterlegte Telegram-User-ID reagieren. Alles andere wird stillschweigend ignoriert.
2. Keine offenen Webserver: Das System nutzt Telegram Long-Polling. Das Web-UI darf nur an `localhost` oder das Tailscale-Interface gebunden werden. Niemals öffentliche Ports freigeben.
3. Secrets Management: API-Keys und Secrets liegen AUSSCHLIESSLICH in `.env`-Dateien. Niemals im Code, im Speicher oder in Logs.
4. Tool Safety: Gefährliche Shell-Kommandos benötigen eine manuelle Bestätigung via Telegram.
5. Keine Third-Party-Skills: Externe Logik darf nur über isolierte MCP-Prozesse laufen.

wenn du noch fragen hast, um die aufgabe optimal zu bearbeiten, stelle diese fragen bitte, bevor du startest.
