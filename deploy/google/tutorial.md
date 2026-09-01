# Create Eve on Google Cloud

<walkthrough-tutorial-duration duration="12"></walkthrough-tutorial-duration>

This walkthrough creates the complete Eve platform inside your organisation's Google Cloud project. Eve's application, PostgreSQL database, encrypted research storage and secrets stay in that project.

## Choose the Google Cloud project

Select an existing project or create a new one. Eve also needs billing enabled because the deployment creates Cloud Run and Cloud SQL resources.

<walkthrough-project-setup billing="true"></walkthrough-project-setup>

The selected project is **<walkthrough-project-id/>**.

## Enable the Google Cloud services

Enable the services Eve uses. The deployment script checks these again, so it is safe if some are already enabled.

<walkthrough-enable-apis apis="run.googleapis.com,cloudbuild.googleapis.com,artifactregistry.googleapis.com,secretmanager.googleapis.com,storage.googleapis.com,iam.googleapis.com,sqladmin.googleapis.com"></walkthrough-enable-apis>

If Google shows an **Authorize Cloud Shell** dialog when you first use the terminal, choose **Authorize**. Cloud Shell authorization lasts for the current session.

To confirm Cloud Shell can see your selected project, run:

```bash
gcloud config get-value project
```

If this prints the project you selected above, continue.

## Create Eve

Run the Eve deployment:

```bash
bash deploy/google/deploy.sh
```

Eve asks for:

- the first Eve administrator email;
- your workspace or department name.

It then creates the database, encrypted organisation storage, secrets, service identity and Cloud Run application. The terminal shows progress as **1/9** through **9/9**.

Do not close Cloud Shell while the deployment is running.

## Finish

<walkthrough-conclusion-trophy></walkthrough-conclusion-trophy>

When the terminal says **Eve is ready**, copy the HTTPS URL shown under **URL**.

Return to the Eve Beta setup page, choose **Google says Eve is ready**, paste that URL, and let Eve verify the live service.

If verification fails, keep the Cloud Shell tab open: the deployment output contains the exact step that needs attention.
