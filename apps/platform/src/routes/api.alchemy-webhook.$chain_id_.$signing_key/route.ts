// the path key is ignored: signatures verify against the env key only. this
// path stays so the webhook urls already registered with alchemy keep working.
export { action } from "$/alchemy-webhook/handler";
