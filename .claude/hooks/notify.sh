#!/bin/bash
# Hook: notify.sh
# Event: Notification
# Purpose: Alert user when Claude needs attention (Windows version using PowerShell)

INPUT=$(cat)
NOTIFICATION_TYPE=$(echo "$INPUT" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.notification_type || 'attention')")

# Windows notification via PowerShell
powershell.exe -Command "
  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
  [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
  \$template = '<toast><visual><binding template=\"ToastText02\"><text id=\"1\">Claude Code</text><text id=\"2\">Needs your attention ($NOTIFICATION_TYPE)</text></binding></visual></toast>'
  \$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
  \$xml.LoadXml(\$template)
  \$toast = [Windows.UI.Notifications.ToastNotification]::new(\$xml)
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Claude Code').Show(\$toast)
" 2>/dev/null || true

exit 0
