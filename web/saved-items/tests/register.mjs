/** Registers the `@/…` alias resolver for `node --import ./tests/register.mjs`. */
import { registerHooks } from "node:module";

import { resolve } from "./alias-hooks.mjs";

registerHooks({ resolve });
