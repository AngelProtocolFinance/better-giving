#!/usr/bin/env bash
# beforeSubmitPrompt hook. Cursor runs this before the backend request that
# builds the skill list. Drain the hook payload, install skills, always allow
# the prompt. Logs stay on stderr so they are not parsed as the hook result.
cat >/dev/null
bash "$(dirname "$0")/../install-agent-skills.sh" >&2
printf '%s\n' '{"continue":true}'
exit 0
