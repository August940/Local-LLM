# Kindred

A companion-chat website that talks to an LLM running on your own computer through [Ollama](https://ollama.com). Nothing leaves your machine.

- `web/index.html`: landing page
- `web/chat.html`: chat app with a companion picker, model picker and streaming replies
- `web/characters.js`: the companions and their personality prompts (edit these to make your own)
- `server.py`: serves the site and forwards chat requests to Ollama (Python 3, no dependencies)

## Run it

1. Install Ollama from https://ollama.com and pull a model:

   ```sh
   ollama pull llama3.2
   ```

2. Start the site:

   ```sh
   python3 server.py
   ```

3. Open http://localhost:8000.

Options: `--port 8080` changes the port, and `--ollama http://host:11434` (or the `OLLAMA_URL` env var) points at an Ollama server elsewhere.

Chats are saved in your browser's local storage. "New chat" clears the current companion's history.
