# Microsoft Azure — full Eve v62.1

The preferred route is Eve deployment launcher → **Microsoft Azure** → **Continue to Microsoft Azure**. Azure Portal then runs Eve's ARM template entirely inside the organisation's Azure account.

The template deploys:

- Azure Database for PostgreSQL Flexible Server 16;
- Azure Container Apps running full Eve;
- Azure Files durable organisation research storage;
- Container App secrets;
- configurable application replica count (default 3).

For a normal deployment, the researcher only needs to enter the first Eve administrator email, workspace name and a temporary first-admin password. The connector and PostgreSQL secrets use secure generated ARM defaults.

PostgreSQL stores Eve operational control-plane state. Azure Files remains the default durable research-storage layer. SharePoint and Entra remain optional integrations rather than prerequisites for first use.

See `ONE_CLICK.md` for the browser deployment journey and trust boundary.
