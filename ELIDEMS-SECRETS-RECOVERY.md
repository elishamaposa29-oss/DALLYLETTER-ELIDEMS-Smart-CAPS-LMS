# Elidems Secret Recovery

## Current status

`ELIDEMS-SECRETS-BACKUP.enc` is intentionally absent. This workspace contains no local real `.env` or secret payload, so creating an encrypted archive here would create an empty or misleading backup. Existing Render/Vercel secret stores were not accessed or changed.

## Approved future procedure

1. Export required values directly from the authorized provider console into a protected local file with mode `600`. Do not print the file, include it in command arguments, or paste it into chat.
2. Confirm it is not tracked: `git check-ignore -v protected-secrets.env`.
3. Use an interactive passphrase and authenticated encryption. With GnuPG:

```sh
umask 077
gpg --symmetric --cipher-algo AES256 --output ELIDEMS-SECRETS-BACKUP.enc protected-secrets.env
```

GnuPG prompts for the passphrase without putting it in the command line. Keep the passphrase in a separate password manager. Do not commit `protected-secrets.env`.

4. Verify decryption without printing content:

```sh
gpg --decrypt --output /tmp/elidems-secrets-check.env ELIDEMS-SECRETS-BACKUP.enc
chmod 600 /tmp/elidems-secrets-check.env
cmp --silent protected-secrets.env /tmp/elidems-secrets-check.env
rm -f /tmp/elidems-secrets-check.env
```

5. Store ciphertext only in an approved private repository or protected backup location. Never store the passphrase with it. Review `git diff`, `git status`, and the staged file list before committing.

## Future-device restore

Install GnuPG, obtain ciphertext and passphrase through separate trusted channels, decrypt into a mode-600 local file, load it into the host secret manager, and remove the plaintext file. Verify only variable presence and service health; never echo values.

## Rotation

After the project is stable, rotate database credentials, JWT signing keys, AI keys, payment credentials, webhook secrets, and OAuth credentials in provider consoles. Update the host secret manager, deploy, revoke old credentials, and verify callbacks. Rotation is not performed by this task.
