import { Field, Modal } from "platform";

// Modal is always authored open here: closed it renders nothing at all.
// It portals to document.body, so `classes` carries the positioning
// (`fixed-center`) exactly as every real caller does.

export const Confirmation = () => (
  <Modal
    open
    onClose={() => {}}
    classes="fixed-center p-8 bg-popover text-popover-fg w-full sm:max-w-md rounded text-center"
  >
    <h3 className="text-xl font-bold text-balance">
      This organization is already registered
    </h3>
    <p className="text-muted-fg text-pretty mt-3">
      Rainforest Trust already has an account on Better Giving. Ask an existing
      admin to invite you, or email support@better.giving for help getting
      access.
    </p>
    <button type="button" className="btn btn-primary mt-6 mx-auto">
      Got it
    </button>
  </Modal>
);

export const InviteMember = () => (
  <Modal
    open
    onClose={() => {}}
    classes="fixed-center p-6 bg-popover text-popover-fg w-full sm:max-w-lg rounded"
  >
    <h4 className="text-center text-xl font-bold mb-6">Invite a team member</h4>
    <div className="grid gap-4">
      <Field
        label="Email"
        required
        placeholder="dana@rainforesttrust.org"
        defaultValue=""
      />
      <Field label="First name" required defaultValue="Dana" />
      <Field label="Last name" required defaultValue="Okoro" />
    </div>
    <div className="flex justify-end gap-2 mt-6">
      <button type="button" className="btn btn-secondary">
        Cancel
      </button>
      <button type="button" className="btn btn-primary">
        Send invite
      </button>
    </div>
  </Modal>
);

export const DestructiveConfirm = () => (
  <Modal
    open
    onClose={() => {}}
    classes="fixed-center p-8 bg-popover text-popover-fg w-full sm:max-w-md rounded"
  >
    <h3 className="text-xl font-bold">Cancel this payout?</h3>
    <p className="text-muted-fg text-pretty mt-3">
      The payout of $1,200.00 to Ocean Conservancy scheduled for Nov 14, 2025
      will not be sent. The balance stays available for the next payout run.
    </p>
    <div className="flex justify-end gap-2 mt-6">
      <button type="button" className="btn btn-secondary">
        Keep payout
      </button>
      <button type="button" className="btn btn-destructive">
        Cancel payout
      </button>
    </div>
  </Modal>
);
