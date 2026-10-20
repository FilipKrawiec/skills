#!/usr/bin/env bash
# Check or apply the GitHub settings in references/github-safety.md.
#
# Usage: github-safety.sh check|apply <owner/repo> <owner> <implementer> <reviewer> <check>...
#   check  prints one line per setting (ok or DRIFT) and exits 1 on any drift.
#   apply  sets what the API can set, then checks. Run it with the owner's token.
#          Reviews and collaborators are skipped until both machine users exist.
# Example: github-safety.sh check acme/app alice acme-bot acme-reviewer verify
set -euo pipefail

usage() { sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }
[ $# -ge 6 ] || usage
mode=$1 repo=$2 owner=$3 implementer=$4 reviewer=$5; shift 5
[ "$mode" = check ] || [ "$mode" = apply ] || usage
checks=("$@")

base=$(gh api "repos/$repo" --jq .default_branch)
drift=0
report() { # report <name> <actual> <expected>
  if [ "$2" = "$3" ]; then echo "ok     $1"; else echo "DRIFT  $1: is '$2', want '$3'"; drift=1; fi
}
exists() { gh api "users/$1" --silent 2>/dev/null; }
json_list() { local out="" item; for item in "$@"; do out+="${out:+,}\"$item\""; done; echo "[$out]"; }
# yes when an active tag ruleset covers refs/tags/v* and refs/tags/rc/*, blocks creation, update
# and deletion, and lets only admins (role 5) and the versioning automation, GitHub Actions
# (integration 15368), bypass it. The list endpoint omits conditions, so read each.
tag_ruleset() {
  local id
  for id in $(gh api "repos/$repo/rulesets" --jq '.[] | select(.target == "tag" and .enforcement == "active") | .id'); do
    if [ "$(gh api "repos/$repo/rulesets/$id" --jq '((["refs/tags/v*", "refs/tags/rc/*"] - .conditions.ref_name.include) == [])
        and ([.rules[].type] | contains(["creation", "update", "deletion"]))
        and ([.bypass_actors[]? | select([.actor_type, .actor_id] | IN(["RepositoryRole", 5], ["Integration", 15368]) | not)] | length == 0)')" = true ]; then
      echo yes; return
    fi
  done
  echo no
}

if [ "$mode" = apply ]; then
  gh api -X PATCH "repos/$repo" -F allow_squash_merge=true -F allow_merge_commit=false \
    -F allow_rebase_merge=false -F allow_auto_merge=true -F delete_branch_on_merge=true >/dev/null
  gh api -X PUT "repos/$repo/actions/permissions/workflow" -f default_workflow_permissions=read \
    -F can_approve_pull_request_reviews=false >/dev/null
  if [ "$(tag_ruleset)" = no ]; then
    gh api -X POST "repos/$repo/rulesets" --input - >/dev/null <<'EOF'
{"name": "release tags", "target": "tag", "enforcement": "active",
 "conditions": {"ref_name": {"include": ["refs/tags/v*", "refs/tags/rc/*"], "exclude": []}},
 "bypass_actors": [{"actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always"},
                   {"actor_id": 15368, "actor_type": "Integration", "bypass_mode": "always"}],
 "rules": [{"type": "creation"}, {"type": "update"}, {"type": "deletion"}]}
EOF
  fi
  if exists "$implementer" && exists "$reviewer"; then
    for user in "$implementer" "$reviewer"; do
      gh api -X PUT "repos/$repo/collaborators/$user" -f permission=push >/dev/null
    done
    gh api -X PUT "repos/$repo/branches/$base/protection" --input - >/dev/null <<EOF
{"required_status_checks": {"strict": false, "contexts": $(json_list "${checks[@]}")},
 "enforce_admins": false,
 "required_pull_request_reviews": {"required_approving_review_count": 1, "require_code_owner_reviews": true,
   "require_last_push_approval": true, "dismiss_stale_reviews": true},
 "restrictions": null, "required_linear_history": true, "allow_force_pushes": false,
 "allow_deletions": false, "required_conversation_resolution": true}
EOF
  else
    echo "skipped: create $implementer and $reviewer, then apply again for collaborators and reviews"
  fi
fi

report "merge methods" "$(gh api "repos/$repo" --jq '[.allow_squash_merge,.allow_merge_commit,.allow_rebase_merge,.allow_auto_merge,.delete_branch_on_merge] | @csv')" "true,false,false,true,true"
report "actions token" "$(gh api "repos/$repo/actions/permissions/workflow" --jq '[.default_workflow_permissions,.can_approve_pull_request_reviews] | @csv')" '"read",false'
tags=$(tag_ruleset)
report "release tag ruleset for v* and rc/*" "$tags" yes
report "$owner role" "$(gh api "repos/$repo/collaborators/$owner/permission" --jq .role_name)" "admin"
for user in "$implementer" "$reviewer"; do
  role=$(gh api "repos/$repo/collaborators/$user/permission" --jq .role_name 2>/dev/null) || role=none
  # A public repository reports `read` for anyone, so a pending invitation can hide behind it.
  if [ "$role" != write ]; then
    [ -n "$(gh api "repos/$repo/invitations" --jq ".[] | select(.invitee.login == \"$user\") | .id")" ] \
      && role="invited, not yet accepted"
  fi
  report "$user role" "$role" "write"
done
[ "$implementer" != "$reviewer" ] && [ "$implementer" != "$owner" ] && [ "$reviewer" != "$owner" ] \
  || { echo "DRIFT  identities: owner, implementer and reviewer must be three accounts"; drift=1; }

# gh writes an error's JSON body to stdout, so read the protection once and keep only a success.
protected=$(gh api "repos/$repo/branches/$base/protection" 2>/dev/null) || protected=""
protection() { if [ -n "$protected" ]; then jq -r "$1" <<<"$protected"; else echo missing; fi; }
report "$base reviews" "$(protection '.required_pull_request_reviews | [.required_approving_review_count, .require_code_owner_reviews, .require_last_push_approval, .dismiss_stale_reviews] | @csv')" "1,true,true,true"
report "$base status checks" "$(protection '.required_status_checks.contexts[]' | LC_ALL=C sort | paste -sd, -)" \
  "$(printf '%s\n' "${checks[@]}" | LC_ALL=C sort | paste -sd, -)"
report "$base history and threads" "$(protection '[.required_linear_history.enabled, .required_conversation_resolution.enabled] | @csv')" "true,true"
report "$base force pushes and deletions" "$(protection '[.allow_force_pushes.enabled, .allow_deletions.enabled] | @csv')" "false,false"
report "$base admins excluded" "$(protection '.enforce_admins.enabled')" "false"
report "repository secrets" "$(gh api "repos/$repo/actions/secrets" --jq .total_count)" "0"

# An environment is safe when the owner must approve it, or it deploys only through a custom
# policy naming the base branch. A tag policy is not enough: the versioning automation's bypass
# lets any workflow run, including one a Write user pushes on a branch, create a matching tag.
# Without a policy, or with "protected branches", any branch a Write user can push may deploy.
while IFS=$'\t' read -r env policy reviewed; do
  [ -n "$env" ] || continue
  if [ "$reviewed" = true ]; then report "environment $env" safe safe; continue; fi
  if [ "$policy" != custom ]; then report "environment $env" "deploys from $policy without owner review" safe; continue; fi
  others=$(gh api "repos/$repo/environments/$(jq -rn --arg e "$env" '$e | @uri')/deployment-branch-policies" \
    --jq "[.branch_policies[] | select(.type == \"branch\" and .name == \"$base\" | not) | .name] | join(\",\")" 2>/dev/null) \
    || others=unreadable
  if [ -z "$others" ]; then report "environment $env" safe safe
  else report "environment $env" "deploys from '$others' without owner review" safe; fi
done < <(gh api "repos/$repo/environments" --jq ".environments[] | [.name,
  (.deployment_branch_policy | if . == null then \"any branch\" elif .custom_branch_policies then \"custom\" else \"protected branches\" end),
  ([.protection_rules[]? | select(.type == \"required_reviewers\") | .reviewers[] | select(.type == \"User\") | .reviewer.login | ascii_downcase] | index(\"$owner\" | ascii_downcase) != null)] | @tsv")

# The Reviewer must be the sole owner on every CODEOWNERS rule. A global rule plus this check
# prevents a narrower or broader later match from replacing that gate.
codeowners=""
for path in .github/CODEOWNERS CODEOWNERS docs/CODEOWNERS; do
  codeowners=$(gh api "repos/$repo/contents/$path?ref=$base" --jq .content 2>/dev/null | base64 --decode 2>/dev/null) && break
  codeowners=""
done
report "Reviewer is sole CODEOWNER on every path" "$(printf '%s\n' "$codeowners" | awk -v r="@$reviewer" '
  { sub(/#.*/, ""); if (NF == 0) next
    rules++
    if (NF != 2 || tolower($2) != tolower(r)) bad = 1
    if ($1 == "*") whole = 1 }
  END { print (whole && rules > 0 && !bad) ? "yes" : "no" }')" yes

exit "$drift"
