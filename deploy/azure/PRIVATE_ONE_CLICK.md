# Eve on Microsoft Azure — private-network deployment

Choose **Microsoft Azure → Private network** in Eve deployment launcher when the organisation requires Eve's runtime and data services to stay off the public internet.

## What Azure creates

- a dedicated Azure virtual network;
- a delegated subnet for the Azure Container Apps environment;
- an **internal-only** Container Apps environment with public network access disabled;
- Azure Database for PostgreSQL Flexible Server 16 using private VNet integration;
- a private PostgreSQL DNS zone linked to the Eve VNet;
- an Azure Storage account with public network access disabled;
- an Azure Files private endpoint and `privatelink.file.core.windows.net` private DNS;
- private DNS for the Container Apps environment so Eve's default hostname resolves to the environment's internal IP;
- the Eve Container App, organisation storage mount, database and deployment secrets.

## Researcher path

1. In Eve deployment launcher, choose **Microsoft Azure**.
2. Choose **Private network**.
3. Sign in to Azure and select the organisation subscription, resource group and region.
4. Enter the first Eve administrator email, workspace name and temporary password.
5. Leave the generated infrastructure names, passwords and default VNet ranges unchanged unless the organisation's Azure team requires different values.
6. Review and create the deployment.
7. Use the `eveUrl` deployment output from a device/network that can route to the Eve VNet.

## Access requirement

This profile deliberately creates **no public Eve endpoint**. Researchers must reach the VNet through an organisation-managed route such as:

- a corporate network already connected to the VNet;
- point-to-site or site-to-site VPN;
- ExpressRoute;
- a peered Azure VNet;
- an organisation-approved private ingress/gateway architecture.

Eve deployment launcher does not configure the organisation's corporate WAN/VPN because that is normally centrally managed infrastructure rather than an application-level setting.

## Security boundary

The Container Apps environment, PostgreSQL endpoint and Azure Files data endpoint are private. Azure Resource Manager remains the deployment control plane. SharePoint and Entra integrations remain optional after Eve is running.

## Existing organisation networks

The one-click template creates an isolated Eve VNet by default because this is portable between organisations. A department with an established hub/spoke network can instead adapt the subnet parameters/template to use its approved network pattern before deployment.
