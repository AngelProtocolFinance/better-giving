import * as v from "valibot";
import { $req } from ".";

export const person_name = v.pipe($req, v.maxLength(50, "max 50 characters"));
