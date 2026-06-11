import { Dialog } from "@base-ui/react/dialog";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { Copier } from "#/components/copier";

type AccountType = "savings" | "investments";

interface PanelProps {
  /** If not provided, user can select via radio buttons */
  account_type?: AccountType;
  /** NPO name used in reference memo */
  npo_name: string;
  /** NPO ID used in reference memo */
  npo_id: string;
  onClose: () => void;
}

interface AccountSelectorProps {
  value: AccountType;
  onChange: (v: AccountType) => void;
  classes?: string;
}

interface InfoSectionProps {
  title: string;
  children: React.ReactNode;
  classes?: string;
}

interface MemoSectionProps {
  memo: string;
  account_type: AccountType;
  classes?: string;
}

interface InfoRowProps {
  label: string;
  value: string;
  copyable?: boolean;
}

interface InfoRowWithDetailsProps {
  label: string;
  value: string;
  details: string;
}

const BANK_DETAILS = {
  account_name: "Better Giving",
  account_number: "822000812545",
  routing_number: "026073150",
  swift_code: "CMFGUS33",
  account_type: "Checking",
  bank_name: "Community Federal Savings Bank",
  bank_address: "89-16 Jamaica Ave, Woodhaven, NY, 11421, United States",
} as const;

export function Panel({
  account_type: initial_account_type,
  npo_name,
  npo_id,
  onClose,
}: PanelProps) {
  const [account_type, set_account_type] = useState<AccountType>(
    initial_account_type ?? "savings"
  );
  const show_selector = !initial_account_type;

  const account_code = account_type === "savings" ? "S" : "I";
  const memo = `${npo_name}+${npo_id}+${account_code}`;

  return (
    <Dialog.Popup className="z-50 fixed-center bg-popover text-popover-fg w-[90vw] max-w-[680px] max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-ring scrollbar-track-border rounded">
      {/* Header */}
      <div className="p-6 md:p-8 border-b relative">
        <h2 className="text-2xl font-bold mb-2">Deposit Funds</h2>
        <p className="text-sm text-muted-fg">
          Transfer funds to your Better Giving account
        </p>
        <button
          type="button"
          onClick={onClose}
          className="absolute top-6 md:top-8 right-6 md:right-8 p-2 rounded border hover:bg-muted transition-colors"
        >
          <X size={24} className="text-muted-fg" />
        </button>
      </div>

      {/* Content */}
      <div className="p-6 md:p-8">
        {/* Account Selector */}
        {show_selector && (
          <AccountSelector
            value={account_type}
            onChange={set_account_type}
            classes="mb-6"
          />
        )}

        {/* Section 1: Bank Account Details */}
        <InfoSection title="Bank Account Details" classes="mb-6">
          <InfoRow label="Account name" value={BANK_DETAILS.account_name} />
          <InfoRow label="Account number" value={BANK_DETAILS.account_number} />
          <InfoRow
            label="Account type"
            value={BANK_DETAILS.account_type}
            copyable={false}
          />
          <InfoRow label="Bank name" value={BANK_DETAILS.bank_name} />
          <InfoRow label="Bank address" value={BANK_DETAILS.bank_address} />
        </InfoSection>

        {/* Section 2: Routing Codes */}
        <InfoSection title="Routing Codes" classes="mb-6">
          <InfoRowWithDetails
            label="ACH Routing"
            value={BANK_DETAILS.routing_number}
            details="US domestic transfers · Free · 1-3 business days"
          />
          <InfoRowWithDetails
            label="SWIFT/BIC"
            value={BANK_DETAILS.swift_code}
            details="International transfers · $6.11 fee · 1-5 business days"
          />
        </InfoSection>

        {/* Section 3: Reference Memo */}
        <MemoSection memo={memo} account_type={account_type} classes="mb-6" />

        {/* Non-USD Note */}
        <p className="text-sm text-muted-fg">
          For non-USD transfers, contact{" "}
          <a
            href="mailto:hi@better.giving"
            className="text-primary underline hover:no-underline"
          >
            hi@better.giving
          </a>{" "}
          for specific instructions.
        </p>
      </div>
    </Dialog.Popup>
  );
}

function AccountSelector({
  value,
  onChange,
  classes = "",
}: AccountSelectorProps) {
  return (
    <div className={classes}>
      <p className="label mb-2">Deposit to</p>
      <RadioGroup
        value={value}
        onValueChange={onChange}
        className="grid grid-cols-2 gap-3"
      >
        <Radio.Root
          value={"savings" satisfies AccountType}
          className="group border rounded p-4 data-checked:border-primary data-checked:bg-accent transition-colors flex items-center justify-between"
        >
          <span className="text-sm font-medium group-data-checked:text-primary">
            Savings account
          </span>
          <Check
            size={18}
            className="text-transparent group-data-checked:text-primary"
          />
        </Radio.Root>
        <Radio.Root
          value={"investments" satisfies AccountType}
          className="group border rounded p-4 data-checked:border-primary data-checked:bg-accent transition-colors flex items-center justify-between"
        >
          <span className="text-sm font-medium group-data-checked:text-primary">
            Investments account
          </span>
          <Check
            size={18}
            className="text-transparent group-data-checked:text-primary"
          />
        </Radio.Root>
      </RadioGroup>
    </div>
  );
}

function InfoSection({ title, children, classes = "" }: InfoSectionProps) {
  return (
    <div className={`bg-muted rounded p-5 ${classes}`}>
      <h3 className="font-bold mb-4">{title}</h3>
      <div className="grid gap-4">{children}</div>
    </div>
  );
}

function MemoSection({ memo, account_type, classes = "" }: MemoSectionProps) {
  const account_label = account_type === "savings" ? "Savings" : "Investments";
  return (
    <div
      className={`bg-warning/10 border border-warning rounded p-5 ${classes}`}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-warning">Your Reference Memo</h3>
        <span className="text-xs font-medium text-warning bg-warning/10 px-2 py-1 rounded">
          {account_label}
        </span>
      </div>
      <p className="text-sm text-warning mb-4">
        You must include this code when making your transfer, or we won't be
        able to identify your deposit.
      </p>
      <div className="bg-card rounded p-4 border border-warning">
        <div className="flex items-center justify-between gap-4">
          <code className="text-lg font-bold font-mono tracking-wide break-all">
            {memo}
          </code>
          <Copier
            text={memo}
            classes={{
              container:
                "shrink-0 px-4 py-2 text-sm font-semibold text-warning-fg bg-warning hover:bg-warning rounded transition-colors flex items-center gap-2",
            }}
          >
            Copy
          </Copier>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, copyable = true }: InfoRowProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
      <span className="text-sm text-muted-fg min-w-[140px]">{label}</span>
      <div className="flex-1 flex items-center gap-2">
        <span className="text-sm font-semibold text-pretty flex-1">
          {value}
        </span>
        {copyable && (
          <Copier
            text={value}
            classes={{
              container:
                "shrink-0 px-2.5 py-1.5 text-xs text-muted-fg bg-card border rounded hover:bg-muted transition-colors",
            }}
          />
        )}
      </div>
    </div>
  );
}

function InfoRowWithDetails({
  label,
  value,
  details,
}: InfoRowWithDetailsProps) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 items-start">
      <span className="text-sm text-muted-fg">{label}</span>
      <div className="flex items-center gap-2 row-span-2">
        <span className="text-sm font-semibold">{value}</span>
        <Copier
          text={value}
          classes={{
            container:
              "shrink-0 px-2.5 py-1.5 text-xs text-muted-fg bg-card border rounded hover:bg-muted transition-colors",
          }}
        />
      </div>
      <p className="text-xs text-muted-fg text-pretty">{details}</p>
    </div>
  );
}
