# Eve on Microsoft 365 / Azure

## v60 approach

Do not make a reduced SharePoint-hosted Eve.

Deploy the **full Eve container** once into the organisation's Azure subscription, then let researchers use it entirely in the browser.

## Included Azure stack

`deploy/azure/azuredeploy.json` creates:

- Azure Container Apps managed environment;
- full Eve Container App;
- Azure Storage + Azure Files persistent mount;
- secure deployment secrets;
- HTTPS public Eve endpoint.

After Eve is running, configure:

- SharePoint storage;
- Entra SSO;
- Microsoft 365 email;
- team/RBAC behavior.

## Researcher experience

Individual researchers do not install software.

If they have Azure resource permissions, they can deploy their own/team Eve from the deployment launcher.

If not, IT runs the deployment once and gives the department its Eve URL.
