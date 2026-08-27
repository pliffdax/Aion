# Deployment operations

`deploy/scripts/deploy.sh` serializes all Aion deployments on the host with
`/tmp/aion-deploy.lock`. GitHub Actions also uses one concurrency group for the
`main` and `development` branches. Both locks must remain shared between the two
environments because they use the same Docker daemon.

The script pulls only the API and Telegram bot images. PostgreSQL is pinned to a
reviewed digest and uses `pull_policy: missing`, so an application deployment
does not update it. Update PostgreSQL in a separate pull request: replace the
digest, deploy to `development`, check the database logs and application smoke
tests, then promote the same digest to `main`. Never change the digest and an
unrelated application release in the same rollout.

After Compose reports both services healthy, the script checks the host API
endpoint and confirms that the API and bot containers are healthy with zero
restarts. Only then does it prune unused Aion runtime images older than 72 hours.
The label filter excludes PostgreSQL, AIA, and other images. Docker does not
prune images referenced by running containers. The command never prunes volumes.

Each runtime target copies production dependencies and changing build artifacts
in separate layers. A source-only release reuses the large dependency layer and
adds only the service `dist` layer. Dependency changes rebuild that larger layer.

## Measured image sizes

Test builds on the amd64 deployment host on 2026-08-27 produced these
`docker image ls` sizes:

| Target       | Previous image | Service-specific image | Code and metadata layers |
| ------------ | -------------- | ---------------------- | ------------------------ |
| API          | 1.11 GB        | 857 MB                 | about 0.5 MB             |
| Telegram bot | 1.11 GB        | 352 MB                 | about 0.83 MB            |

The API dependency layer is 412 MB because it includes the Prisma CLI and schema
engine required by `prisma migrate deploy`. It changes when production
dependencies change, not on every source commit. The previous Dockerfile added a
shared application layer of about 593 MB for every commit.

The `GHCR retention` workflow is manual and starts in dry-run mode. It preserves
the current `main` and `development` commit images plus the newest 20 tagged SHA
versions in each package. Add any deployed SHA that does not match a branch tip
to `additional_protected_shas`. Review the dry-run summary before rerunning it
with deletion enabled. Untagged OCI manifests are intentionally left alone
because deleting them independently can break tagged multi-manifest images.

## Rollout

1. Merge the feature branch into `development` through the normal pull request.
2. Let the standard deployment build both targets and update the development
   stack. Do not invoke the script by hand during the workflow.
3. Confirm `/api/health`, the bot health status, restart counts, container logs,
   and `docker system df` on the host.
4. Exercise a bot command that reads and writes Aion data.
5. Promote the tested `development` commit to `main` through the normal pull
   request and approval flow.
6. Run `GHCR retention` once in dry-run mode. Enable deletion only after the
   protected SHA list and candidate versions match the intended rollback set.
