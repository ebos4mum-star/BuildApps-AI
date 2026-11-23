# GitHub App setup (read-only)

Nothing here has been created for you. Registering the App is an owner action on github.com.

## 1. Register the App

GitHub -> Settings -> Developer settings -> GitHub Apps -> New GitHub App.

| Field                                                      | Value                                                                              |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Name / slug                                                | e.g. `buildapps-ai` (the slug goes in `GITHUB_APP_SLUG`)                           |
| Homepage URL                                               | your web origin                                                                    |
| Callback URL                                               | `https://<web-origin>/api/github/callback`                                         |
| Setup URL                                                  | `https://<web-origin>/api/github/callback` (tick **Redirect on update**)           |
| **Request user authorization (OAuth) during installation** | **ON** - required: the OAuth `code` proves the installer controls the installation |
| Expire user authorization tokens                           | ON                                                                                 |
| Webhook URL                                                | `https://<web-origin>/api/github/webhook`                                          |
| Webhook secret                                             | a long random value -> `GITHUB_APP_WEBHOOK_SECRET`                                 |
| Where can this App be installed                            | Any account                                                                        |

## 2. Permissions - least privilege

Repository permissions (everything else **No access**):

- **Contents: Read-only** - file tree and sampled text files
- **Metadata: Read-only** (mandatory)
- **Checks: Read-only** - repository CI results, used as verification evidence

Subscribe to events: **Installation**, **Installation repositories**.
Installation tokens are additionally minted per scan, limited to these three permissions and to the single repository being scanned.

## 3. Credentials -> environment (server only)

Generate a private key (downloads a `.pem`) and a client secret, then set on the web host:
`GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`, `GITHUB_STATE_SECRET` (>= 32 random chars), `APP_URL`.
None of these may be committed or prefixed `NEXT_PUBLIC_`/`EXPO_PUBLIC_`. BuildApps never stores GitHub tokens in the database.

## 4. How access is controlled

- The user picks which repositories to share on GitHub's own install screen; BuildApps lists only those.
- Disconnecting in BuildApps uninstalls the App from GitHub (unless a colleague's BuildApps account still uses the same installation) and unlinks projects. The `installation` webhook keeps BuildApps in sync if the user revokes on GitHub first.
- Rotate the private key / client secret on GitHub if exposed; no data migration is needed.

## 5. What is NOT verified yet

The gateway is unit-tested against a mocked GitHub API (JWT signing, token scoping, pagination, truncation, error handling) and the whole flow is browser-tested against a fixture-backed fake. It has not been exercised against github.com because that needs your App credentials.
