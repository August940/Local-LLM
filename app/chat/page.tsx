import { Chat } from "@/components/Chat";

export const metadata = { title: "Chat · dressmaker.ai" };

export default function ChatPage() {
  return (
    <div className="page">
      <header className="title-row"><div>
        <h1>
          Chat with a stylist
        </h1>
        <p>Talk through an idea and get a polished prompt you can send straight to the generator.</p>
        </div>
      </header>
      <Chat />
    </div>
  );
}
