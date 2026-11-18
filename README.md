<img src="public/logo.svg" alt="" width="48" height="48">

# Harblet

Harblet is a deploy platform you host on your own servers, as an alternative to Vercel, Render and Heroku. One command installs it on a fresh Ubuntu server. From then on you deploy Docker images, Git repositories, databases and ready-made apps such as GitLab from the browser.

[Documentation](https://harblet.com/docs) · [Releases](https://github.com/harblet/harblet/releases)

## Features

- **Docker images and Git repositories.** A repository builds from its Dockerfile, or without one through [Railpack](https://github.com/railwayapp/railpack). Private GitHub repositories connect through a GitHub App that Harblet sets up for you, and private GitLab repositories through an access token, on GitLab.com or your own GitLab.
- **Databases.** PostgreSQL 18 and MySQL 8.4 or 9.7 in one click. Only services in the same project can reach them.
- **Templates.** authentik, Directus, GitLab, n8n, Plausible, Umami, Uptime Kuma and WordPress install in one click, with their database, volumes and domain. Each part is a normal service that you can change afterwards.
- **Volumes.** A folder that keeps a service's files across deployments and restarts. A service with volumes stays on one server and stops briefly during a deployment. If that deployment fails, it stays stopped until you redeploy the one before.
- **Backups.** Database dumps go to S3-compatible storage every 15 minutes, every hour or every day. Each one can be downloaded and restored. Harblet backs up its own database the same way.
- **Domains with HTTPS.** Add your domains to a service and upload their certificates. Wildcard certificates work.
- **Environment variables,** encrypted in Harblet's database.
- **Deployments you can follow.** Build logs, live logs and health checks. If a deployment fails, the version before it keeps running, and an earlier deployment can be redeployed.
- **Deploy hooks.** Every service has a secret URL. A `POST` from your CI pipeline deploys it.
- **More servers.** Run one command on a new server and it joins. When a server fails, its services start on another one.
- **Your team.** Invite colleagues with a link, as admins or members.
- **Updates from the browser.** One click updates Harblet, and Harblet keeps k3s on the servers up to date.

## Requirements

- A fresh server with Ubuntu 24.04 or 26.04 and root access. The install script stops if k3s is already installed.
- At least 2 CPUs and 4 GB of memory.
- Ports 80 and 443 open for your services, and port 3000 for Harblet until it has its own domain.
- Internet access from the server.

## Install

```sh
curl -fsSL https://harblet.com/install.sh | sudo sh
```

The script installs [k3s](https://k3s.io) and Harblet. When Harblet is ready, it prints the address, for example `http://203.0.113.10:3000`. Open it and create the first account.

Harblet accepts logins only at that address. If the server is behind NAT, or your browser reaches it at another address, pass that address:

```sh
curl -fsSL https://harblet.com/install.sh | sudo HARBLET_URL=http://203.0.113.10:3000 sh
```

## First steps

1. **Deploy a service.** Create a project and add a service: a Docker image, a Git repository, a database or a template. For private repositories, connect GitHub or GitLab first under Settings → Git. Services in a project reach each other at the internal address on each service's page. Other projects can't reach them.
2. **Add a domain.** Point the domain at the first server with a DNS A record and upload its certificate under SSL Certificates. Then add the domain on the service's Domains page.
3. **Give Harblet its own domain** under Settings → General. From then on you log in at `https://<domain>`, and you can close port 3000 in your firewall.
4. **Set up backups.** Add your S3 storage under Backup destinations. Choose it on each database's Backups page, and under Settings → Backups for Harblet itself. Copy the app secret from Settings → Backups and keep it somewhere safe, because restoring Harblet needs it.
5. **Invite your team** under Invitations.

## License

Harblet is licensed under the [Business Source License 1.1](LICENSE). It is source-available, not open source.

- Production use is free while all your installs together manage one server and you don't offer Harblet to others as a hosted or managed service.
- For more servers, write to mail@harblet.com about a commercial license.
- Each version becomes available under the Apache License 2.0 four years after its release.

The [LICENSE](LICENSE) file is what counts.
