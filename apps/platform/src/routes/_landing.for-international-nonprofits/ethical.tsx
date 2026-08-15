export function Ethical({ classes = "" }) {
  return (
    <section className={classes}>
      <div className="max-w-3xl mx-auto bg-card border border-border rounded p-5 md:p-8">
        <h2 className="article-heading">Ethical fundraising, verifiable</h2>
        <p className="text-base/relaxed text-muted-fg mt-3 text-pretty">
          We've endorsed the National Council of Nonprofits' Principles for
          Ethical Online Fundraising, and our code is public. Your board, your
          auditor, or your donors can audit it and confirm we do what we say.
        </p>
      </div>
    </section>
  );
}
