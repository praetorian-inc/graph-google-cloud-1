## Integration Walkthrough for multi project using GCP Console

Given the correct permissions, JupiterOne has the ability to automatically
discover each project under a Google Cloud organization and configure
integration instances for each of the projects.

Customers authorize access by creating a
[Google Cloud service account](https://cloud.google.com/iam/docs/creating-managing-service-accounts)
and providing the service account key to JupiterOne.

##### Setup

1. Select one Google Cloud project to configure a service account for
   JupiterOne.
1. Create the service account without a role. Copy the email address of the new
   service account (e.g. `my-sa@my-j1-project.iam.gserviceaccount.com`).
   - **NOTE**: See the
     [Google Cloud service account documentation](https://cloud.google.com/iam/docs/creating-managing-service-accounts#creating)
     for more information on how to create a service account in the project.
1. Generate and copy a new service account key.
   - **NOTE**: See the
     [Google Cloud service account key documentation](https://cloud.google.com/iam/docs/creating-managing-service-account-keys#creating_service_account_keys)
     for more information on how to create a service account key.
1. Enable all service APIs in the "main" project and each "child" project that
   you'd like JupiterOne to access. Documentation for enabling service APIs is
   described in an earlier section of this document.
   - **Main**: Main project represents the project that was selected when
     service account was created.
   - **Child**: Child projects represent all the projects under the same
     organization that you wish integration to automatically
   - **NOTE**: The "Cloud Asset" and "Identity and Access Management (IAM)" APIs
     only need to be enabled in the "main" project.
1. Switch to the organization that you'd like to create individual integration
   instances for each project
1. [Create a new custom role](https://cloud.google.com/iam/docs/creating-custom-roles)
   with the following permissions:

```
resourcemanager.folders.get
resourcemanager.folders.list
resourcemanager.organizations.get
resourcemanager.projects.get
resourcemanager.projects.list
serviceusage.services.list
resourcemanager.organizations.getIamPolicy
cloudasset.assets.searchAllIamPolicies
```

Some additional data may be optionally ingested by the JupiterOne Google Cloud
integration by configuring a custom role with the following permissions:

```
appengine.applications.get
binaryauthorization.policy.get
compute.projects.get
```

The integration will also try to ingest organization policy for
"storage.publicAccessPrevention" to precisely calculate storage buckets public
access, it is therefore recommended that the following permission is also
included in the custom role above:

```
orgpolicy.policy.get
```

1. Navigate to the Cloud Resource Manager for that organization and
   [add a new member (principal) to the organization](https://cloud.google.com/resource-manager/docs/access-control-org#grant-access).
   The new member (principal) email address is the email address of the service
   account that was created earlier. Select the new organization role that was
   created above (without it integration won't be able to traverse the
   organization and discover each project), as well as the Google Cloud managed
   role "Security Reviewer" (`roles/iam.securityReviewer`) or an alternative
   JupiterOne custom role that you've created.

2. Navigate to the JupiterOne Google Cloud integration configuration page to
   begin configuring the "main" integration instance.

### In JupiterOne

1. From the configuration **Gear Icon**, select **Integrations**.
2. Scroll to the **Google Cloud** integration tile and click it.
3. Click the **Add Configuration** button and configure the following settings:

- Enter the **Account Name** by which you'd like to identify this Google Cloud
  account in JupiterOne. Ingested entities will have this value stored in
  `tag.AccountName` when **Tag with Account Name** is checked.
- Enter a **Description** that will further assist your team when identifying
  the integration instance.
- Select a **Polling Interval** that you feel is sufficient for your monitoring
  needs. You may leave this as `DISABLED` and manually execute the integration.

**NOTE**: The "Polling Interval" that is selected for the "main" integration
instances, will be the same polling interval that is used for each of the child
integration instances.

- Use the generated service account key as the value for the **Service Account
  Key File** field.

- Check the "Configure Organization Projects" checkbox
- Place the numerical value of the Google Cloud organization into the
  **Organization ID** text field (e.g. "1234567890")

4. Click **Create Configuration** once all values are provided.

**NOTE**: Depending on how many projects exist under a Google Cloud
organization, the auto-configuration process may take a few minutes to complete.
When the process has been completed, you will see your new integration instances
on the JupiterOne Google Cloud integration list page.

## How to Uninstall

1. From the configuration **Gear Icon**, select **Integrations**.
2. Scroll to the **Google Cloud** integration tile and click it.
3. Identify and click the **integration to delete**.
4. Click the **trash can** icon.
5. Click the **Remove** button to delete the integration.
