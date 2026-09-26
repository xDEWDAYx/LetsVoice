# Render LLM Markdown as inert native text

Ask AI treats every assistant reply as untrusted model output and renders a bounded Markdown subset through native React Native text components so users see headings, emphasis, lists, quotes, and code without raw formatting markers. Raw HTML, scripts, remote images, executable code, and non-HTTPS URI schemes are never activated; an HTTPS link opens outside the app only after the user confirms its domain. This gives readable answers without introducing an executable WebView or allowing model text to trigger hidden network access.
