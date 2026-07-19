import { HttpResponse, http } from "msw";
import type { AccountRequirements, WiseCurrency } from "#/types/bank-details";

// minimal currency list
const currencies: WiseCurrency[] = [
  {
    code: "USD",
    name: "United States Dollar",
    symbol: "$",
    countryKeywords: ["united states"],
    supportsDecimals: true,
  },
  {
    code: "EUR",
    name: "Euro",
    symbol: "€",
    countryKeywords: ["europe"],
    supportsDecimals: true,
  },
];

// minimal account requirements — one IBAN type with 2 text fields
const account_requirements: AccountRequirements[] = [
  {
    type: "iban",
    title: "IBAN",
    usageInfo: null,
    fields: [
      {
        name: "Account holder",
        group: [
          {
            key: "accountHolderName",
            name: "Full name of the account holder",
            type: "text",
            refreshRequirementsOnChange: false,
            required: true,
            displayFormat: null,
            example: "Jane Doe",
            minLength: 1,
            maxLength: 100,
            validationRegexp: null,
            validationAsync: null,
            valuesAllowed: null,
          },
        ],
      },
      {
        name: "IBAN",
        group: [
          {
            key: "details.IBAN",
            name: "IBAN",
            type: "text",
            refreshRequirementsOnChange: false,
            required: true,
            displayFormat: null,
            example: "DE89370400440532013000",
            minLength: 2,
            maxLength: 34,
            validationRegexp: null,
            validationAsync: null,
            valuesAllowed: null,
          },
        ],
      },
    ],
  },
];

export const wise_handlers = [
  // currencies
  http.get("/api/wise/v1/currencies", () => HttpResponse.json(currencies)),

  // create quote
  http.post("/api/wise/v3/profiles/:profileId/quotes", () =>
    HttpResponse.json({ id: "test-quote-1" })
  ),

  // get requirements
  http.get("/api/wise/v1/quotes/:quoteId/account-requirements", () =>
    HttpResponse.json(account_requirements)
  ),

  // refresh requirements (POST)
  http.post("/api/wise/v1/quotes/:quoteId/account-requirements", () =>
    HttpResponse.json(account_requirements)
  ),

  // create recipient account
  http.post("/api/wise/v1/accounts", () =>
    HttpResponse.json({ id: 999, currency: "EUR", details: {} })
  ),

  // file upload — presigned URL
  http.post("/api/file-upload", () =>
    HttpResponse.json({
      url: "https://example.com/bank-statement.pdf",
      presigned_url: "https://s3.example.com/put",
      content_type: "application/pdf",
    })
  ),

  // s3 presigned PUT
  http.put("https://s3.example.com/put", () => new HttpResponse(null)),

  // EIN lookup — 404 (no existing NPO)
  http.get("/api/npos/ein/:ein", () => new HttpResponse(null, { status: 404 })),
];
