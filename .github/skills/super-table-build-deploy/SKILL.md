---
name: super-table-build-deploy
description: 'Build and deploy the directus-super-table extension to the Ghosts WA Directus server. Use when building super-table, deploying the extension, copying index.js to the server, backing up live files, restarting EA Podman, and verifying Directus health.'
user-invocable: true
---

# Super Table Build And Deploy

## When To Use

- Build the `directus-super-table` extension locally
- Deploy a new `index.js` and `package.json` to the live Ghosts WA Directus server
- Back up the currently deployed extension before replacing it
- Restart Directus after a deployment
- Verify that the deployment is healthy

## Environment

Local repo:

- `/home/sam/projects/ghosts/directus-super-table`

Production host:

- `root@fhwavps1.cloudservers.net.au`

Directus runtime model:

- cPanel EA Podman service, not `docker compose`
- service name: `directus.ghostswa.02`

Live extension path on server:

- `/home/ghostswa/ea-podman.d/directus/extensions/directus-extension-super-table`

Restart command:

- `su - ghostswa -c '/usr/local/cpanel/scripts/ea-podman restart directus.ghostswa.02'`

Health check:

- `https://data.ghostswa.au/server/ping`

## Standard Procedure

### 1. Build Locally

Run from the repo root:

```sh
cd /home/sam/projects/ghosts/directus-super-table
pnpm run build
```

Expected artifacts:

- `index.js`
- `package.json`

### 2. Back Up The Live Extension

Create timestamped backups on the server before copying anything:

```sh
ssh root@fhwavps1.cloudservers.net.au 'set -e; TS=$(date +%Y%m%d-%H%M%S); SUPER=/home/ghostswa/ea-podman.d/directus/extensions/directus-extension-super-table; cp "$SUPER/index.js" "$SUPER/index.js.$TS.bak"; cp "$SUPER/package.json" "$SUPER/package.json.$TS.bak"; echo "Backup timestamp: $TS"'
```

### 3. Copy The New Files

Deploy the local build products:

```sh
scp /home/sam/projects/ghosts/directus-super-table/index.js /home/sam/projects/ghosts/directus-super-table/package.json root@fhwavps1.cloudservers.net.au:/home/ghostswa/ea-podman.d/directus/extensions/directus-extension-super-table/
```

Then fix ownership:

```sh
ssh root@fhwavps1.cloudservers.net.au 'chown ghostswa:ghostswa /home/ghostswa/ea-podman.d/directus/extensions/directus-extension-super-table/index.js /home/ghostswa/ea-podman.d/directus/extensions/directus-extension-super-table/package.json'
```

### 4. Restart Directus

```sh
ssh root@fhwavps1.cloudservers.net.au "su - ghostswa -c '/usr/local/cpanel/scripts/ea-podman restart directus.ghostswa.02'"
```

### 5. Verify The Deployment

Check container status:

```sh
ssh root@fhwavps1.cloudservers.net.au "su - ghostswa -c '/usr/local/cpanel/scripts/ea-podman status directus.ghostswa.02'"
```

Check public health:

```sh
curl -sS -i https://data.ghostswa.au/server/ping | head -n 12
```

Success criteria:

- service status shows `active (running)`
- `/server/ping` returns `HTTP 200`
- response body is `pong`

## Working Style

When doing this in a session:

1. Prefer step-by-step deployment rather than combining build, backup, copy, restart, and verify into one long command.
2. Report progress after each major step:
   - build complete
   - backup complete
   - copy complete
   - restart complete
   - health verified
3. If the user asks to deploy only a subset of changes, deploy only `index.js` and `package.json` for this repo.
4. Do not use the repository's local `docker-compose.yml` for production deployment.

## Common Follow-Up Checks

After deployment, verify the feature that changed instead of relying only on ping:

- search behavior
- quick filter behavior
- pagination behavior
- row refresh behavior after returning from item pages
- inline/edit-mode rendering
- hover/title behavior for text cells

## Rollback

If the deployment causes a regression, restore the latest backup files:

```sh
ssh root@fhwavps1.cloudservers.net.au 'set -e; SUPER=/home/ghostswa/ea-podman.d/directus/extensions/directus-extension-super-table; cp "$SUPER/index.js.<timestamp>.bak" "$SUPER/index.js"; cp "$SUPER/package.json.<timestamp>.bak" "$SUPER/package.json"; chown ghostswa:ghostswa "$SUPER/index.js" "$SUPER/package.json"'
```

Then restart Directus again.

## Notes

- The server is currently using EA Podman under the `ghostswa` account.
- The live Directus image version may be newer than the runbook summary; always trust the running service status over stale documentation.
- For stats/count behavior in `super-table`, be aware that some permission models reject main-request meta counts; the UI may intentionally hide stats if they are unavailable.