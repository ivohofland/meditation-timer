# Deploying timer.fair.yoga

The timer is static files, served by the Nginx already running on fair.yoga's
VPS. No Node process and no container serve it; a throwaway container only
builds it. The box is shared, but nothing that operates it is: the timer has
its own Nginx site file, its own certificate, its own web root, its own
checkout and its own deploy key and script. Nothing here edits fair.yoga's
site file, containers, deploy key or `fairyoga-deploy`.

`<user>` below is the account fair.yoga deploys as: it can run `docker`, and
it will own the timer's checkout and web root.

## 1. One-time setup

### DNS

`A` and `AAAA` records for `timer.fair.yoga` pointing at the VPS's IPv4 and
IPv6. Check before going on: `dig +short timer.fair.yoga A AAAA`.

### Checkout and web root

```bash
sudo install -d -o <user> -g <user> -m 755 /opt/meditation-timer /var/www/timer.fair.yoga
sudo -u <user> git clone https://github.com/ivohofland/meditation-timer.git /opt/meditation-timer
```

The checkout is only fetched, never moved: the deploy reads each commit with
`git archive`.

### Nginx and the certificate

The certificate comes first, because Nginx refuses to load a `listen ... ssl`
block while the certificate files it names do not exist. Serve the port-80
block alone:

```bash
sudo tee /etc/nginx/sites-available/timer.fair.yoga >/dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name timer.fair.yoga;
    location /.well-known/acme-challenge/ { root /var/www/timer.fair.yoga; }
    location / { return 301 https://$host$request_uri; }
}
EOF
sudo ln -s /etc/nginx/sites-available/timer.fair.yoga /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

A certificate of its own, not an expansion of fair.yoga's, so a broken timer
DNS record can never fail fair.yoga's renewal:

```bash
sudo certbot certonly --webroot -w /var/www/timer.fair.yoga -d timer.fair.yoga -m <your email> --agree-tos --no-eff-email
```

Then the full config:

```bash
sudo cp /opt/meditation-timer/deploy/nginx.conf.example /etc/nginx/sites-available/timer.fair.yoga
sudo nginx -t && sudo systemctl reload nginx
```

`certonly --webroot` does not reload Nginx after a renewal. fair.yoga's own
setup installs `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh`, which
reloads Nginx for every certificate. Check that it is there and that the dry
run lists both certificates:

```bash
ls /etc/letsencrypt/renewal-hooks/deploy/
sudo certbot renew --dry-run
```

Until the first deploy, `https://timer.fair.yoga` answers 404: the `current`
link it serves does not exist yet.

### The deploy script and its key

1. **Install the script where the key will point.** A root-owned copy, so a
   commit that changes `deploy/deploy.sh` changes nothing the key can run
   until you have read it and installed it again. Rerun this after every
   change to `deploy/deploy.sh`:

   ```bash
   sudo install -m 755 -o root -g root /opt/meditation-timer/deploy/deploy.sh /usr/local/bin/timer-deploy
   ```

2. **A key that can do nothing but deploy the timer.** A new one, not
   fair.yoga's. Make it anywhere but the VPS, with no passphrase (CI cannot
   type one):

   ```bash
   ssh-keygen -t ed25519 -N "" -C github-timer-deploy -f github-timer-deploy
   ```

   On the VPS, append the public half to `<user>`'s `~/.ssh/authorized_keys`,
   forced onto the script:

   ```
   command="/usr/local/bin/timer-deploy",restrict ssh-ed25519 AAAA… github-timer-deploy
   ```

   `command=` runs the script whatever the caller asks for, and passes what it
   asked for in `SSH_ORIGINAL_COMMAND`, which the script accepts only as one
   full commit hash. `restrict` turns off the terminal and every kind of
   forwarding. fair.yoga's deploy key on the same account is unaffected.

3. **The host key, pinned.** From your machine, then compare the fingerprint
   with the one the VPS itself reports, so the pinned key is the real one:

   ```bash
   ssh-keyscan -t ed25519 <vps-ip> > deploy_known_hosts && ssh-keygen -lf deploy_known_hosts
   # on the VPS:  ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
   ```

4. **GitHub → meditation-timer → Settings → Environments → `production`.**
   Under deployment branches, allow `main` only. Add three secrets:

   | Secret | Value |
   |---|---|
   | `DEPLOY_SSH_KEY` | the private half (`cat github-timer-deploy`), then delete the local copy |
   | `DEPLOY_HOST` | `<user>@<vps-ip>` |
   | `DEPLOY_KNOWN_HOSTS` | the contents of `deploy_known_hosts` |

   With none of the three set, the job warns that deploy is not configured
   and succeeds; with only some set, it fails.

Test it by re-running the `deploy` job of the latest `main` run.

## 2. Updates

A commit on `main` deploys itself once `ci` has passed: the `deploy` job in
`.github/workflows/ci.yml` connects over SSH and runs `timer-deploy` with that
commit's hash. The script:

1. refuses anything but a full commit hash on `origin/main`;
2. answers success and changes nothing for the commit already serving or an
   older one, so two runs finishing out of order cannot roll the site back;
3. unpacks the commit with `git archive` into a build folder beside the
   releases, and builds it in a throwaway `node:22-alpine` container, with the
   pnpm that `package.json` pins (asserted: corepack's own fallback is a
   different major);
4. moves the build to `/var/www/timer.fair.yoga/releases/<commit>` and
   points the `current` link at it in one rename, so a request sees the old
   release or the new one, never neither;
5. keeps the five newest releases along `main`, for rolling back.

A failed build leaves the serving release alone and removes its build folder.

By hand, as `<user>` on the VPS:

```bash
cd /opt/meditation-timer && git fetch -q origin main && timer-deploy "$(git rev-parse origin/main)"
```

## 3. Rolling back

Point `current` at an earlier release, in one rename:

```bash
cd /var/www/timer.fair.yoga && ls releases/
ln -sfn releases/<commit> current.tmp && mv -T current.tmp current
```

The next push to `main` deploys forward from there as usual. To stay on the
old release, revert the bad commit on `main` instead.

## 4. Checking it

```bash
curl -sI https://timer.fair.yoga                      # 200, and every header in nginx.conf.example
curl -sI http://timer.fair.yoga                       # 301 to https
curl -sI https://timer.fair.yoga/stream/end.ts        # Content-Type: video/mp2t
curl -sI https://timer.fair.yoga/manifest.webmanifest # Content-Type: application/manifest+json
curl -sI https://fair.yoga/api/health                 # fair.yoga answers as before
```

On a phone:

- **iPhone:** a sitting plays with the screen locked, and the lock screen shows
  the fair.yoga icon. Two settings make this work: the stream needs
  `media-src data:` in the CSP and the `video/mp2t` type for its pieces.
  Without either, it stays silent with no error on the page.
- **Android:** the screen stays on during a sitting, which is what
  `screen-wake-lock=(self)` allows.
