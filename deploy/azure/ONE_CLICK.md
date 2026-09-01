# Eve on Microsoft Azure — browser-first deployment

Eve deployment launcher offers two Azure profiles.

## Standard Azure

Choose **Standard Azure** for the lowest-friction deployment. Azure asks for the subscription/resource group/region plus the first administrator email, workspace name and temporary password. Generated secure parameters provide the connector secret and PostgreSQL password.

Azure creates:

- Azure Container Apps environment and Eve Container App;
- Azure Database for PostgreSQL Flexible Server 16 and Eve database;
- Azure Storage account + Azure Files share for durable organisation research storage;
- Container App secrets for bootstrap, connector and PostgreSQL credentials.

The standard profile gives Eve a public HTTPS endpoint. PostgreSQL uses its managed public endpoint with the Azure-services firewall rule.

## Private network Azure

Choose **Private network** when the organisation requires Eve's runtime and data plane to stay off the public internet. See `PRIVATE_ONE_CLICK.md`. This path adds a dedicated VNet, internal-only Container Apps environment, private PostgreSQL, private Azure Files and private DNS.

## Trust boundary

The deployment launcher constructs the Azure Portal deployment links only. Azure receives the deployment parameters directly. The deployment launcher never receives the Azure account token, deployment secrets, studies, responses, recordings or storage contents.
