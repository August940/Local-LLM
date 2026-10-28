const $ = (id) => document.getElementById(id);
const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
};

let current = CHARACTERS.find((c) => c.id === location.hash.slice(1)) || CHARACTERS[0];
let history = [];
let busy = false;

function avatar(c, size = 44) {
  const d = document.createElement("div");
  d.className = "dot";
  d.style.cssText = `width:${size}px;height:${size}px;background:linear-gradient(135deg,${c.colors[0]},${c.colors[1]})`;
  d.textContent = c.name[0];
  return d;
}

function renderContacts() {
  const list = $("contacts");
  list.innerHTML = "";
  for (const c of CHARACTERS) {
    const row = document.createElement("div");
    row.className = "contact" + (c === current ? " active" : "");
    row.appendChild(avatar(c));
    const text = document.createElement("div");
    text.innerHTML = "<strong></strong><small></small>";
    text.querySelector("strong").textContent = c.name;
    text.querySelector("small").textContent = c.tagline;
    row.appendChild(text);
    row.onclick = () => { location.hash = c.id; $("sidebar").classList.remove("open"); };
    list.appendChild(row);
  }
}

function addBubble(role, text) {
  const div = document.createElement("div");
  div.className = "msg " + role;
  div.textContent = text;
  $("messages").appendChild(div);
  $("messages").scrollTop = $("messages").scrollHeight;
  return div;
}

function load(character) {
  current = character;
  history = store.get("chat:" + current.id, []);
  if (!history.length) history = [{ role: "assistant", content: current.greeting }];
  const header = $("chat-header");
  header.innerHTML = "";
  header.appendChild(avatar(current, 40));
  const title = document.createElement("div");
  title.innerHTML = "<strong></strong><small style='display:block;color:var(--muted)'></small>";
  title.querySelector("strong").textContent = current.name;
  title.querySelector("small").textContent = current.tagline;
  header.appendChild(title);
  $("messages").innerHTML = "";
  for (const m of history) addBubble(m.role, m.content);
  renderContacts();
}

async function loadModels() {
  const select = $("model");
  try {
    const res = await fetch("/api/tags");
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    const names = data.models.map((m) => m.name);
    if (!names.length) throw new Error("No models installed. Run: ollama pull llama3.2");
    select.innerHTML = "";
    for (const n of names) select.add(new Option(n, n));
    const saved = store.get("model", null);
    if (names.includes(saved)) select.value = saved;
  } catch (e) {
    select.innerHTML = "<option>Unavailable</option>";
    addBubble("error", e.message);
  }
}

async function send(text) {
  busy = true;
  $("send").disabled = true;
  history.push({ role: "user", content: text });
  addBubble("user", text);
  const bubble = addBubble("assistant", "…");
  let reply = "";
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: $("model").value,
        stream: true,
        messages: [{ role: "system", content: current.prompt }, ...history],
      }),
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const chunk = JSON.parse(line);
        if (chunk.error) throw new Error(chunk.error);
        reply += chunk.message?.content || "";
        bubble.textContent = reply;
        $("messages").scrollTop = $("messages").scrollHeight;
      }
    }
    history.push({ role: "assistant", content: reply });
    store.set("chat:" + current.id, history);
  } catch (e) {
    bubble.remove();
    history.pop();
    addBubble("error", e.message);
  } finally {
    busy = false;
    $("send").disabled = false;
  }
}

$("composer").onsubmit = (e) => {
  e.preventDefault();
  const text = $("input").value.trim();
  if (!text || busy) return;
  $("input").value = "";
  send(text);
};
$("input").onkeydown = (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("composer").requestSubmit(); }
};
$("model").onchange = () => store.set("model", $("model").value);
$("reset-btn").onclick = () => { store.set("chat:" + current.id, []); load(current); };
$("menu-btn").onclick = () => $("sidebar").classList.toggle("open");
window.onhashchange = () => load(CHARACTERS.find((c) => c.id === location.hash.slice(1)) || CHARACTERS[0]);

load(current);
loadModels();
