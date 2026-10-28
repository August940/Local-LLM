export const metadata = { title: "Content policy · dressmaker.ai" };

export default function PolicyPage() {
  return (
    <div className="page">
      <header className="title-row"><div>
        <h1>
          Content policy
        </h1>
        <p>dressmaker.ai is a creative tool for fashion design. These rules keep it safe for everyone.</p>
        </div>
      </header>
      <div className="prose">
        <h2>You must be 18 or older</h2>
        <p>Accounts are for adults only. By signing up you confirm you are at least 18.</p>

        <h2>Not allowed</h2>
        <ul>
          <li>Nudity, sexual or sexually suggestive content, including lingerie or see-through clothing shoots.</li>
          <li>Any depiction of minors. All generated models must be clearly adult.</li>
          <li>Images of real, identifiable people (celebrities, public figures, private individuals) or face swaps.</li>
          <li>Uploading photos of other people without their consent.</li>
          <li>Violence, gore, hate symbols, harassment or content that promotes discrimination.</li>
          <li>Copying protected logos, trademarks or another brand&apos;s identity.</li>
        </ul>

        <h2>How we enforce it</h2>
        <ul>
          <li>Every prompt is screened before it reaches the queue. Blocked prompts are not charged.</li>
          <li>A safety negative prompt is added to every generation.</li>
          <li>Content shared on Explore can be reported and removed. Repeated violations lead to account suspension.</li>
        </ul>

        <h2>Your content</h2>
        <p>
          Your uploads and results are stored privately in your account. They are only shown publicly if you choose to
          share them on Explore, and you can delete them at any time.
        </p>
      </div>
    </div>
  );
}
