import { Chat } from "@/components/Chat";

export const metadata = { title: "Chat · dressmaker.ai" };

export default function ChatPage() {
  return (
    <div className="page">
      <header className="page-header">
        <h1>
          Chat with your <span className="gradient-text">stylist</span>
        </h1>
        <p>Talk through an idea and get a polished prompt you can send straight to the generator.</p>
      </header>
      <Chat />
    </div>
  );
}
