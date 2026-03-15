# GitHub Actions documentation

Automate, customize, and execute your software development workflows right in your repository with GitHub Actions. You can discover, create, and share actions to perform any job you'd like, including CI/CD, and combine actions in a completely customized workflow.

## Recommended

* [Quickstart for GitHub Actions](/en/actions/get-started/quickstart)

  Try out the core features of GitHub Actions in minutes.

* [Understanding GitHub Actions](/en/actions/get-started/understand-github-actions)

  Learn the basics of core concepts and essential terminology in GitHub Actions.

* [Use Actions Runner Controller](/en/actions/tutorials/use-actions-runner-controller)

  You can host your own runners to run workflows in a highly customizable environment.

* [Workflow syntax for GitHub Actions](/en/actions/reference/workflows-and-actions/workflow-syntax)

  A workflow is a configurable automated process made up of one or more jobs. You must create a YAML file to define your workflow configuration.

* [Events that trigger workflows](/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)

  You can configure your workflows to run when specific activity on GitHub happens, at a scheduled time, or when an event outside of GitHub occurs.

* [Using artifact attestations to establish provenance for builds](/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)

  Artifact attestations enable you to increase the supply chain security of your builds by establishing where and how your software was built.

* [Migrating to GitHub Actions](/en/actions/tutorials/migrate-to-github-actions)

  Learn how to migrate your existing CI/CD workflows to GitHub Actions.

* [Reuse workflows](/en/actions/how-tos/reuse-automations/reuse-workflows)

  Learn how to avoid duplication when creating a workflow by reusing existing workflows.

* [Viewing GitHub Actions metrics](/en/actions/how-tos/administer/view-metrics)

  You can view metrics to monitor where your organization or repositories use GitHub Actions and how they are performing.

## Links

### Getting started

* [Understanding GitHub Actions](/en/actions/get-started/understand-github-actions)

  Learn the basics of core concepts and essential terminology in GitHub Actions.

* [Quickstart for GitHub Actions](/en/actions/get-started/quickstart)

  Try out the core features of GitHub Actions in minutes.

## Articles

* [Quickstart for GitHub Actions](/en/actions/get-started/quickstart)

  Try out the core features of GitHub Actions in minutes.

* [Understanding GitHub Actions](/en/actions/get-started/understand-github-actions)

  Learn the basics of core concepts and essential terminology in GitHub Actions.

* [Continuous integration](/en/actions/get-started/continuous-integration)

  You can create custom continuous integration (CI) workflows directly in your GitHub repository with GitHub Actions.

* [Continuous deployment](/en/actions/get-started/continuous-deployment)

  You can create custom continuous deployment (CD) workflows directly in your GitHub repository with GitHub Actions.

* [GitHub Actions vs GitHub Apps](/en/actions/get-started/actions-vs-apps)

  Learn about the key differences between GitHub Actions and GitHub Apps to help you decide which is right for your use cases.

* [Workflows](/en/actions/concepts/workflows-and-actions/workflows)

  Get a high-level overview of GitHub Actions workflows, including triggers, syntax, and advanced features.

* [Variables](/en/actions/concepts/workflows-and-actions/variables)

  Learn about variables in GitHub Actions workflows.

* [Contexts](/en/actions/concepts/workflows-and-actions/contexts)

  Learn about contexts in GitHub Actions.

* [Expressions](/en/actions/concepts/workflows-and-actions/expressions)

  You can evaluate expressions in workflows and actions.

* [Reusing workflow configurations](/en/actions/concepts/workflows-and-actions/reusing-workflow-configurations)

  Learn how to avoid duplication when creating a workflow.

* [About custom actions](/en/actions/concepts/workflows-and-actions/custom-actions)

  Actions are individual tasks that you can combine to create jobs and customize your workflow. You can create your own actions, or use and customize actions shared by the GitHub community.

* [Deployment environments](/en/actions/concepts/workflows-and-actions/deployment-environments)

  You can create and deploy to different environments.

* [Concurrency](/en/actions/concepts/workflows-and-actions/concurrency)

  Learn about running workflows and jobs simultaneously.

* [Workflow artifacts](/en/actions/concepts/workflows-and-actions/workflow-artifacts)

  Learn about storing and sharing data as artifacts of GitHub Actions workflows.

* [Dependency caching](/en/actions/concepts/workflows-and-actions/dependency-caching)

  Learn about dependency caching for workflow speed and efficiency.

* [Notifications for workflow runs](/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs)

  You can subscribe to notifications about workflow runs that you trigger.

* [GitHub-hosted runners](/en/actions/concepts/runners/github-hosted-runners)

  GitHub offers hosted virtual machines to run workflows. The virtual machine contains an environment of tools, packages, and settings available for GitHub Actions to use.

* [Larger runners](/en/actions/concepts/runners/larger-runners)

  Learn about the types and uses of GitHub-hosted larger runners.

* [Self-hosted runners](/en/actions/concepts/runners/self-hosted-runners)

  You can host your own runners and customize the environment used to run jobs in your GitHub Actions workflows.

* [Private networking with GitHub-hosted runners](/en/actions/concepts/runners/private-networking)

  You can connect GitHub-hosted runners to resources on a private network, including package registries, secret managers, and other on-premises services.

* [Runner groups](/en/actions/concepts/runners/runner-groups)

  Learn about what a runner group is, and how to use them to control access to runners at the organization level.

* [Runner scale sets](/en/actions/concepts/runners/runner-scale-sets)

  Learn about what a runner scale set is and how they can interact with the Actions Runner Controller.

* [Actions Runner Controller](/en/actions/concepts/runners/actions-runner-controller)

  You can host your own runners and customize the environment used to run jobs in your GitHub Actions workflows.

* [Support for Actions Runner Controller](/en/actions/concepts/runners/support-for-arc)

  What to know before you contact GitHub Support for assistance with Actions Runner Controller.

* [Secrets](/en/actions/concepts/security/secrets)

  Learn about secrets as they are used in GitHub Actions workflows.

* [GITHUB\_TOKEN](/en/actions/concepts/security/github_token)

  Learn what GITHUB\_TOKEN is, how it works, and why it matters for secure automation in GitHub Actions workflows.

* [OpenID Connect](/en/actions/concepts/security/openid-connect)

  OpenID Connect allows your workflows to exchange short-lived tokens directly from your cloud provider.

* [Artifact attestations](/en/actions/concepts/security/artifact-attestations)

  Understand the usage and security benefits of artifact attestations.

* [Script injections](/en/actions/concepts/security/script-injections)

  Understand the security risks associated with script injections and GitHub Actions workflows.

* [Compromised runners](/en/actions/concepts/security/compromised-runners)

  Understand the security risks associated with compromised GitHub Actions runners.

* [Kubernetes admissions controller](/en/actions/concepts/security/kubernetes-admissions-controller)

  Understand how you can use an admissions controller to enforce artifact attestations in your Kubernetes cluster.

* [About GitHub Actions metrics](/en/actions/concepts/metrics)

  Learn about the GitHub Actions metrics available for your organizations and repositories.

* [Billing and usage](/en/actions/concepts/billing-and-usage)

  There are usage limits for GitHub Actions workflows. Usage charges apply to repositories that go beyond the amount of free minutes and storage for a repository.

* [Using workflow templates](/en/actions/how-tos/write-workflows/use-workflow-templates)

  GitHub provides workflow templates for a variety of languages and tooling.

* [Triggering a workflow](/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)

  How to automatically trigger GitHub Actions workflows

* [Using conditions to control job execution](/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions)

  Prevent a job from running unless your conditions are met.

* [Control the concurrency of workflows and jobs](/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)

  Manage which workflows and jobs can run simultaneously.

* [Choosing the runner for a job](/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job)

  Define the type of machine that will process a job in your workflow.

* [Running jobs in a container](/en/actions/how-tos/write-workflows/choose-where-workflows-run/run-jobs-in-a-container)

  Use a container to run the steps in a job.

* [Using jobs in a workflow](/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-jobs)

  Use workflows to run multiple jobs.

* [Using pre-written building blocks in your workflow](/en/actions/how-tos/write-workflows/choose-what-workflows-do/find-and-customize-actions)

  You can use and customize pre-written actions to power your workflow.

* [Using GitHub CLI in workflows](/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-github-cli)

  You can script with GitHub CLI in GitHub Actions workflows.

* [Adding scripts to your workflow](/en/actions/how-tos/write-workflows/choose-what-workflows-do/add-scripts)

  You can use GitHub Actions workflows to run scripts.

* [Using secrets in GitHub Actions](/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)

  Learn how to create secrets at the repository, environment, and organization levels for GitHub Actions workflows.

* [Store information in variables](/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables)

  GitHub sets default variables for each GitHub Actions workflow run. You can also set custom variables for use in a single workflow or multiple workflows.

* [Passing information between jobs](/en/actions/how-tos/write-workflows/choose-what-workflows-do/pass-job-outputs)

  You can define outputs to pass information from one job to another.

* [Setting a default shell and working directory](/en/actions/how-tos/write-workflows/choose-what-workflows-do/set-default-values-for-jobs)

  Define the default settings that will apply to all jobs in the workflow, or all steps in a job.

* [Deploying to a specific environment](/en/actions/how-tos/write-workflows/choose-what-workflows-do/deploy-to-environment)

  Specify a deployment environment in your workflow.

* [Running variations of jobs in a workflow](/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations)

  Create a matrix to define variations for each job.

* [Reuse workflows](/en/actions/how-tos/reuse-automations/reuse-workflows)

  Learn how to avoid duplication when creating a workflow by reusing existing workflows.

* [Creating workflow templates for your organization](/en/actions/how-tos/reuse-automations/create-workflow-templates)

  Learn how you can create workflow templates to help people in your team add new workflows more easily.

* [Sharing actions and workflows from your private repository](/en/actions/how-tos/reuse-automations/share-across-private-repositories)

  You can share an action or reusable workflow without publishing them publicly.

* [Sharing actions and workflows with your organization](/en/actions/how-tos/reuse-automations/share-with-your-organization)

  You can share an action or reusable workflow with your organization without publishing the action or workflow publicly.

* [Sharing actions and workflows with your enterprise](/en/share-with-your-enterprise)

  You can share an action or reusable workflow with your enterprise without publishing the action or workflow publicly.

* [Using artifact attestations to establish provenance for builds](/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)

  Artifact attestations enable you to increase the supply chain security of your builds by establishing where and how your software was built.

* [Using artifact attestations and reusable workflows to achieve SLSA v1 Build Level 3](/en/actions/how-tos/secure-your-work/use-artifact-attestations/increase-security-rating)

  Building software with reusable workflows and artifact attestations can streamline your supply chain security and help you achieve SLSA v1.0 Build Level 3.

* [Enforcing artifact attestations with a Kubernetes admission controller](/en/actions/how-tos/secure-your-work/use-artifact-attestations/enforce-artifact-attestations)

  Use an admission controller to enforce artifact attestations in your Kubernetes cluster.

* [Verifying attestations offline](/en/actions/how-tos/secure-your-work/use-artifact-attestations/verify-attestations-offline)

  Artifact attestations can be verified without an internet connection.

* [Managing the lifecycle of artifact attestations](/en/actions/how-tos/secure-your-work/use-artifact-attestations/manage-attestations)

  Search for and delete attestations that you no longer need.

* [Configuring OpenID Connect in Amazon Web Services](/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)

  Use OpenID Connect within your workflows to authenticate with Amazon Web Services.

* [Configuring OpenID Connect in Azure](/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-azure)

  Use OpenID Connect within your workflows to authenticate with Azure.

* [Configuring OpenID Connect in Google Cloud Platform](/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-google-cloud-platform)

  Use OpenID Connect within your workflows to authenticate with Google Cloud Platform.

* [Configuring OpenID Connect in HashiCorp Vault](/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-hashicorp-vault)

  Use OpenID Connect within your workflows to authenticate with HashiCorp Vault.

* [Configuring OpenID Connect in JFrog](/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-jfrog)

  Use OpenID Connect within your workflows to authenticate with JFrog.

* [Configuring OpenID Connect in Octopus Deploy](/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-octopus-deploy)

  Use OpenID Connect within your workflows to authenticate with Octopus Deploy.

* [Configuring OpenID Connect in PyPI](/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-pypi)

  Use OpenID Connect within your workflows to authenticate with PyPI.

* [Configuring OpenID Connect in cloud providers](/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-cloud-providers)

  Use OpenID Connect within your workflows to authenticate with cloud providers.

* [Using OpenID Connect with reusable workflows](/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-with-reusable-workflows)

  You can use reusable workflows with OIDC to standardize and security harden your deployment steps.

* [Deploying with GitHub Actions](/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments)

  Learn how to control deployments with features like environments and concurrency.

* [Viewing deployment history](/en/actions/how-tos/deploy/configure-and-manage-deployments/view-deployment-history)

  View current and previous deployments for your repository.

* [Managing environments for deployment](/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)

  You can create environments and secure those environments with deployment protection rules. A job that references an environment must follow any protection rules for the environment before running or accessing the environment's secrets.

* [Reviewing deployments](/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments)

  You can approve or reject jobs awaiting review.

* [Creating custom deployment protection rules](/en/actions/how-tos/deploy/configure-and-manage-deployments/create-custom-protection-rules)

  Use GitHub Apps to automate protecting deployments with third-party systems.

* [Configuring custom deployment protection rules](/en/actions/how-tos/deploy/configure-and-manage-deployments/configure-custom-protection-rules)

  Use GitHub Apps to automate protecting deployments with third-party systems.

* [Deploying Node.js to Azure App Service](/en/actions/how-tos/deploy/deploy-to-third-party-platforms/nodejs-to-azure-app-service)

  Learn how to deploy a Node.js project to Azure App Service as part of your continuous deployment (CD) workflows.

* [Deploying Python to Azure App Service](/en/actions/how-tos/deploy/deploy-to-third-party-platforms/python-to-azure-app-service)

  Learn how to deploy a Python project to Azure App Service as part of your continuous deployment (CD) workflows.

* [Deploying Java to Azure App Service](/en/actions/how-tos/deploy/deploy-to-third-party-platforms/java-to-azure-app-service)

  Learn how to deploy a Java project to Azure App Service as part of your continuous deployment (CD) workflows.

* [Deploying .NET to Azure App Service](/en/actions/how-tos/deploy/deploy-to-third-party-platforms/net-to-azure-app-service)

  Learn how to deploy a .NET project to Azure App Service as part of your continuous deployment (CD) workflows.

* [Deploying PHP to Azure App Service](/en/actions/how-tos/deploy/deploy-to-third-party-platforms/php-to-azure-app-service)

  Learn how to deploy a PHP project to Azure App Service as part of your continuous deployment (CD) workflows.

* [Deploying Docker to Azure App Service](/en/actions/how-tos/deploy/deploy-to-third-party-platforms/docker-to-azure-app-service)

  Learn how to deploy a Docker container to Azure App Service as part of your continuous deployment (CD) workflows.

* [Deploying to Azure Static Web App](/en/actions/how-tos/deploy/deploy-to-third-party-platforms/azure-static-web-app)

  Learn how to deploy a web app to Azure Static Web App as part of your continuous deployment (CD) workflows.

* [Deploying to Azure Kubernetes Service](/en/actions/how-tos/deploy/deploy-to-third-party-platforms/azure-kubernetes-service)

  Learn how to deploy a project to Azure Kubernetes Service (AKS) as part of a continuous deployment (CD) workflow.

* [Deploying to Amazon Elastic Container Service](/en/actions/how-tos/deploy/deploy-to-third-party-platforms/amazon-elastic-container-service)

  Learn how to deploy a project to Amazon Elastic Container Service (ECS) as part of a continuous deployment (CD) workflow.

* [Deploying to Google Kubernetes Engine](/en/actions/how-tos/deploy/deploy-to-third-party-platforms/google-kubernetes-engine)

  Learn how to deploy a project to Google Kubernetes Engine (GKE) as part of a continuous deployment (CD) workflow.

* [Installing an Apple certificate on macOS runners for Xcode development](/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications)

  Learn how to sign Xcode apps within a continuous integration (CI) workflow by installing an Apple code signing certificate on GitHub Actions runners.

* [Managing custom actions](/en/actions/how-tos/create-and-publish-actions/manage-custom-actions)

  Learn how to create and manage your own actions, and customize actions shared by the GitHub community.

* [Creating a third party CLI action](/en/actions/how-tos/create-and-publish-actions/create-a-cli-action)

  Learn how to develop an action to set up a CLI on GitHub Actions runners.

* [Setting exit codes for actions](/en/actions/how-tos/create-and-publish-actions/set-exit-codes)

  You can use exit codes to set the status of an action. GitHub displays statuses to indicate passing or failing actions.

* [Publishing actions in GitHub Marketplace](/en/actions/how-tos/create-and-publish-actions/publish-in-github-marketplace)

  You can publish actions in GitHub Marketplace and share actions you've created with the GitHub community.

* [Releasing and maintaining actions](/en/actions/how-tos/create-and-publish-actions/release-and-maintain-actions)

  You can leverage automation and open source best practices to release and maintain actions.

* [Using immutable releases and tags to manage your action's releases](/en/actions/how-tos/create-and-publish-actions/using-immutable-releases-and-tags-to-manage-your-actions-releases)

  Learn how you can use a combination of immutable releases on GitHub and Git tags to manage your action's releases.

* [Manually running a workflow](/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)

  When a workflow is configured to run on the workflow\_dispatch event, you can run the workflow using the Actions tab on GitHub, GitHub CLI, or the REST API.

* [Re-running workflows and jobs](/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)

  You can re-run a workflow run, all failed jobs in a workflow run, or specific jobs in a workflow run up to 30 days after its initial run.

* [Canceling a workflow run](/en/actions/how-tos/manage-workflow-runs/cancel-a-workflow-run)

  You can cancel a workflow run, including all jobs and steps, that is in progress.

* [Disabling and enabling a workflow](/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows)

  You can disable and re-enable a workflow using the GitHub UI, the REST API, or GitHub CLI.

* [Skipping workflow runs](/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs)

  You can skip workflow runs triggered by the push and pull\_request events by including a command in your commit message.

* [Deleting a workflow run](/en/actions/how-tos/manage-workflow-runs/delete-a-workflow-run)

  You can delete a workflow run that has been completed, or is more than two weeks old.

* [Downloading workflow artifacts](/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts)

  You can download archived artifacts before they automatically expire.

* [Removing workflow artifacts](/en/actions/how-tos/manage-workflow-runs/remove-workflow-artifacts)

  You can reclaim used GitHub Actions storage by deleting artifacts before they expire on GitHub.

* [Managing caches](/en/actions/how-tos/manage-workflow-runs/manage-caches)

  You can monitor, filter, and delete dependency caches created from your workflows.

* [Approving workflow runs from forks](/en/actions/how-tos/manage-workflow-runs/approve-runs-from-forks)

  You can manually approve workflow runs that have been triggered by a contributor's pull request.

* [Using GitHub-hosted runners](/en/actions/how-tos/manage-runners/github-hosted-runners/use-github-hosted-runners)

  You can assign a job to run on a virtual machine hosted by GitHub.

* [Customizing GitHub-hosted runners](/en/actions/how-tos/manage-runners/github-hosted-runners/customize-runners)

  You can install additional software on GitHub-hosted runners as a part of your workflow.

* [Viewing your current jobs](/en/actions/how-tos/manage-runners/github-hosted-runners/view-current-jobs)

  Monitor how GitHub-hosted runners are processing jobs in your organization or enterprise, and identify any related constraints.

* [Using an API gateway with OIDC](/en/actions/how-tos/manage-runners/github-hosted-runners/connect-to-a-private-network/connect-with-oidc)

  You can use OpenID Connect (OIDC) tokens to authenticate your workflow.

* [Using WireGuard to create a network overlay](/en/actions/how-tos/manage-runners/github-hosted-runners/connect-to-a-private-network/connect-with-wireguard)

  You can create an overlay network between your runner and a service in your private network.

* [Adding self-hosted runners](/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners)

  You can add a self-hosted runner to a repository, an organization, or an enterprise.

* [Running scripts before or after a job](/en/actions/how-tos/manage-runners/self-hosted-runners/run-scripts)

  Scripts can automatically execute on a self-hosted runner, directly before or after a job.

* [Customizing the containers used by jobs](/en/actions/how-tos/manage-runners/self-hosted-runners/customize-containers)

  You can customize how your self-hosted runner invokes a container for a job.

* [Configuring the self-hosted runner application as a service](/en/actions/how-tos/manage-runners/self-hosted-runners/configure-the-application)

  You can configure the self-hosted runner application as a service to automatically start the runner application when the machine starts.

* [Using labels with self-hosted runners](/en/actions/how-tos/manage-runners/self-hosted-runners/apply-labels)

  You can use labels to organize your self-hosted runners based on their characteristics.

* [Using self-hosted runners in a workflow](/en/actions/how-tos/manage-runners/self-hosted-runners/use-in-a-workflow)

  To use self-hosted runners in a workflow, you can use labels or groups to specify the runner for a job.

* [Managing access to self-hosted runners using groups](/en/actions/how-tos/manage-runners/self-hosted-runners/manage-access)

  You can use policies to limit access to self-hosted runners that have been added to an organization.

* [Monitoring and troubleshooting self-hosted runners](/en/actions/how-tos/manage-runners/self-hosted-runners/monitor-and-troubleshoot)

  You can monitor your self-hosted runners to view their activity and diagnose common issues.

* [Removing self-hosted runners](/en/actions/how-tos/manage-runners/self-hosted-runners/remove-runners)

  You can permanently remove a self-hosted runner from a repository.

* [Managing larger runners](/en/actions/how-tos/manage-runners/larger-runners/manage-larger-runners)

  You can configure larger runners for your organization or enterprise.

* [Controlling access to larger runners](/en/actions/how-tos/manage-runners/larger-runners/control-access)

  You can use policies to limit access to larger runners that have been added to an organization or enterprise.

* [Running jobs on larger runners](/en/actions/how-tos/manage-runners/larger-runners/use-larger-runners)

  You can speed up your workflows by configuring them to run on larger runners.

* [Using custom images](/en/actions/how-tos/manage-runners/larger-runners/use-custom-images)

  Create, manage, and use custom images for GitHub-hosted larger runners in your organization or enterprise.

* [Using proxy servers with a runner](/en/actions/how-tos/manage-runners/use-proxy-servers)

  You can configure runners in isolated environments to use a proxy server for secure communication with GitHub.

* [Using the visualization graph](/en/actions/how-tos/monitor-workflows/use-the-visualization-graph)

  Every workflow run generates a real-time graph that illustrates the run progress. You can use this graph to monitor and debug workflows.

* [Viewing workflow run history](/en/actions/how-tos/monitor-workflows/view-workflow-run-history)

  You can view logs for each run of a workflow. Logs include the status for each job and step in a workflow.

* [Viewing job execution time](/en/actions/how-tos/monitor-workflows/view-job-execution-time)

  You can view the execution time of a job, including the billable minutes that a job accrued.

* [Adding a workflow status badge](/en/actions/how-tos/monitor-workflows/add-a-status-badge)

  You can display a status badge in your repository to indicate the status of your workflows.

* [Using workflow run logs](/en/actions/how-tos/monitor-workflows/use-workflow-run-logs)

  You can view, search, and download the logs for each job in a workflow run.

* [Viewing job condition expression logs](/en/actions/how-tos/monitor-workflows/view-job-condition-logs)

  Learn how to access and interpret expression evaluation logs for job-level if conditions in GitHub Actions.

* [Enabling debug logging](/en/actions/how-tos/monitor-workflows/enable-debug-logging)

  If the workflow logs do not provide enough detail to diagnose why a workflow, job, or step is not working as expected, you can enable additional debug logging.

* [Troubleshooting workflows](/en/actions/how-tos/troubleshoot-workflows)

  You can use the tools in GitHub Actions to debug your workflows.

* [Viewing GitHub Actions metrics](/en/actions/how-tos/administer/view-metrics)

  You can view metrics to monitor where your organization or repositories use GitHub Actions and how they are performing.

* [Making retired namespaces available on GHE.com](/en/reuse-namespaces-on-ghecom)

  Allow people to use namespaces that match actions you have used from GitHub.com.

* [Getting help from GitHub Support about GitHub Actions](/en/actions/how-tos/get-support)

  Learn how GitHub Support can assist with GitHub Actions

* [Workflow syntax for GitHub Actions](/en/actions/reference/workflows-and-actions/workflow-syntax)

  A workflow is a configurable automated process made up of one or more jobs. You must create a YAML file to define your workflow configuration.

* [Events that trigger workflows](/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)

  You can configure your workflows to run when specific activity on GitHub happens, at a scheduled time, or when an event outside of GitHub occurs.

* [Workflow commands for GitHub Actions](/en/actions/reference/workflows-and-actions/workflow-commands)

  You can use workflow commands when running shell commands in a workflow or in an action's code.

* [Variables reference](/en/actions/reference/workflows-and-actions/variables)

  Find information for supported variables, naming conventions, limits, and contexts in GitHub Actions workflows.

* [Evaluate expressions in workflows and actions](/en/actions/reference/workflows-and-actions/expressions)

  Find information for expressions in GitHub Actions.

* [Contexts reference](/en/actions/reference/workflows-and-actions/contexts)

  Find information about contexts available in GitHub Actions workflows, including available properties, access methods, and usage examples.

* [Deployments and environments](/en/actions/reference/workflows-and-actions/deployments-and-environments)

  Find information about deployment protection rules, environment secrets, and environment variables.

* [Dependency caching reference](/en/actions/reference/workflows-and-actions/dependency-caching)

  Find information on the functionality of dependency caching in workflows.

* [Reusing workflow configurations](/en/actions/reference/workflows-and-actions/reusing-workflow-configurations)

  Find information about avoiding duplication when creating a workflow by reusing existing workflows.

* [Metadata syntax reference](/en/actions/reference/workflows-and-actions/metadata-syntax)

  You can create actions to perform tasks in your repository. If you're making a custom action, it will require a metadata file that uses YAML syntax.

* [Workflow cancellation reference](/en/actions/reference/workflows-and-actions/workflow-cancellation)

  Find information on the steps GitHub takes to cancel a workflow run.

* [Dockerfile support for GitHub Actions](/en/actions/reference/workflows-and-actions/dockerfile-support)

  When creating a Dockerfile for a Docker container action, you should be aware of how some Docker instructions interact with GitHub Actions and an action's metadata file.

* [GitHub-hosted runners reference](/en/actions/reference/runners/github-hosted-runners)

  Find information about GitHub-hosted runners, including their specifications and customization options.

* [Larger runners reference](/en/actions/reference/runners/larger-runners)

  Find information about larger runners, including their specifications and customization options.

* [Self-hosted runners reference](/en/actions/reference/runners/self-hosted-runners)

  Find information about setting up and using self-hosted runners.

* [Secure use reference](/en/actions/reference/security/secure-use)

  Security practices for writing workflows and using GitHub Actions features.

* [Secrets reference](/en/actions/reference/security/secrets)

  Find technical information about secrets in GitHub Actions.

* [OpenID Connect reference](/en/actions/reference/security/oidc)

  Find information about using OpenID Connect (OIDC) to authenticate GitHub Actions workflows with cloud providers.

* [Actions limits](/en/actions/reference/limits)

  There are limits in GitHub Actions which you may hit as you scale up, some may be increased by contacting support.

* [Supplemental arguments and settings](/en/actions/reference/github-actions-importer/supplemental-arguments-and-settings)

  GitHub Actions Importer has several supplemental arguments and settings to tailor the migration process to your needs.

* [Extending GitHub Actions Importer with custom transformers](/en/actions/reference/github-actions-importer/custom-transformers)

  GitHub Actions Importer offers the ability to extend its built-in mapping.

* [Creating an example workflow](/en/actions/tutorials/create-an-example-workflow)

  In this tutorial, you'll learn how to create a basic workflow that is triggered by a push event.

* [Building and testing Go](/en/actions/tutorials/build-and-test-code/go)

  Learn how to create a continuous integration (CI) workflow to build and test your Go project.

* [Building and testing Java with Ant](/en/actions/tutorials/build-and-test-code/java-with-ant)

  Learn how to create a continuous integration (CI) workflow in GitHub Actions to build and test your Java project with Ant.

* [Building and testing Java with Gradle](/en/actions/tutorials/build-and-test-code/java-with-gradle)

  Learn how to create a continuous integration (CI) workflow in GitHub Actions to build and test your Java project with Gradle.

* [Building and testing Java with Maven](/en/actions/tutorials/build-and-test-code/java-with-maven)

  Learn how to create a continuous integration (CI) workflow in GitHub Actions to build and test your Java project with Maven.

* [Building and testing .NET](/en/actions/tutorials/build-and-test-code/net)

  Learn how to create a continuous integration (CI) workflow to build and test your .NET project.

* [Building and testing Node.js](/en/actions/tutorials/build-and-test-code/nodejs)

  Learn how to create a continuous integration (CI) workflow to build and test your Node.js project.

* [Building and testing PowerShell](/en/actions/tutorials/build-and-test-code/powershell)

  Learn how to create a continuous integration (CI) workflow to build and test your PowerShell project.

* [Building and testing Python](/en/actions/tutorials/build-and-test-code/python)

  Learn how to create a continuous integration (CI) workflow to build and test your Python project.

* [Building and testing Ruby](/en/actions/tutorials/build-and-test-code/ruby)

  You can create a continuous integration (CI) workflow to build and test your Ruby project.

* [Building and testing Rust](/en/actions/tutorials/build-and-test-code/rust)

  Learn how to create a continuous integration (CI) workflow to build and test your Rust project.

* [Building and testing Swift](/en/actions/tutorials/build-and-test-code/swift)

  Learn how to create a continuous integration (CI) workflow to build and test your Swift project.

* [Building and testing Xamarin applications](/en/actions/tutorials/build-and-test-code/xamarin-apps)

  Learn how to create a continuous integration (CI) workflow in GitHub Actions to build and test your Xamarin application.

* [Use GITHUB\_TOKEN for authentication in workflows](/en/actions/tutorials/authenticate-with-github_token)

  Learn how to use the GITHUB\_TOKEN to authenticate on behalf of GitHub Actions.

* [Migrating from self-hosted runners to GitHub-hosted runners](/en/actions/tutorials/migrate-to-github-runners)

  Learn how to assess your current CI infrastructure and migrate workflows from self-hosted runners to GitHub-hosted runners.

* [Creating a JavaScript action](/en/actions/tutorials/create-actions/create-a-javascript-action)

  In this tutorial, you'll learn how to build a JavaScript action using the actions toolkit.

* [Creating a composite action](/en/actions/tutorials/create-actions/create-a-composite-action)

  In this tutorial, you'll learn how to build a composite action.

* [Publishing Docker images](/en/actions/tutorials/publish-packages/publish-docker-images)

  In this tutorial, you'll learn how to publish Docker images to a registry, such as Docker Hub or GitHub Packages, as part of your continuous integration (CI) workflow.

* [Publishing Java packages with Gradle](/en/actions/tutorials/publish-packages/publish-java-packages-with-gradle)

  In this tutorial, you'll learn how to use Gradle to publish Java packages to a registry as part of your continuous integration (CI) workflow.

* [Publishing Java packages with Maven](/en/actions/tutorials/publish-packages/publish-java-packages-with-maven)

  In this tutorial, you'll learn how to use Maven to publish Java packages to a registry as part of your continuous integration (CI) workflow.

* [Publishing Node.js packages](/en/actions/tutorials/publish-packages/publish-nodejs-packages)

  In this tutorial, you'll learn how to publish Node.js packages to a registry as part of your continuous integration (CI) workflow.

* [Adding labels to issues](/en/actions/tutorials/manage-your-work/add-labels-to-issues)

  You can use GitHub Actions to automatically label issues.

* [Closing inactive issues](/en/actions/tutorials/manage-your-work/close-inactive-issues)

  You can use GitHub Actions to comment on or close issues that have been inactive for a certain period of time.

* [Commenting on an issue when a label is added](/en/actions/tutorials/manage-your-work/add-comments-with-labels)

  You can use GitHub Actions to automatically comment on issues when a specific label is applied.

* [Scheduling issue creation](/en/actions/tutorials/manage-your-work/schedule-issue-creation)

  You can use GitHub Actions to create an issue on a regular basis for things like daily meetings or quarterly reviews.

* [Store and share data with workflow artifacts](/en/actions/tutorials/store-and-share-data)

  Use artifacts to share data between jobs in a workflow and store data once that workflow has completed.

* [Creating a Docker container action](/en/actions/tutorials/use-containerized-services/create-a-docker-container-action)

  In this tutorial, you'll learn how to build a Docker container action.

* [Communicating with Docker service containers](/en/actions/tutorials/use-containerized-services/use-docker-service-containers)

  Learn how to use Docker service containers to connect databases, web services, memory caches, and other tools to your workflow.

* [Creating PostgreSQL service containers](/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers)

  You can create a PostgreSQL service container to use in your workflow. This guide shows examples of creating a PostgreSQL service for jobs that run in containers or directly on the runner machine.

* [Creating Redis service containers](/en/actions/tutorials/use-containerized-services/create-redis-service-containers)

  You can use service containers to create a Redis client in your workflow. This guide shows examples of creating a Redis service for jobs that run in containers or directly on the runner machine.

* [Automating migration with GitHub Actions Importer](/en/actions/tutorials/migrate-to-github-actions/automated-migrations/use-github-actions-importer)

  Use GitHub Actions Importer to plan and automate your migration to GitHub Actions.

* [Migrating from Azure DevOps with GitHub Actions Importer](/en/actions/tutorials/migrate-to-github-actions/automated-migrations/azure-devops-migration)

  Learn how to use GitHub Actions Importer to automate the migration of your Azure DevOps pipelines to GitHub Actions.

* [Migrating from Bamboo with GitHub Actions Importer](/en/actions/tutorials/migrate-to-github-actions/automated-migrations/bamboo-migration)

  Learn how to use GitHub Actions Importer to automate the migration of your Bamboo pipelines to GitHub Actions.

* [Migrating from Bitbucket Pipelines with GitHub Actions Importer](/en/actions/tutorials/migrate-to-github-actions/automated-migrations/bitbucket-pipelines-migration)

  Learn how to use GitHub Actions Importer to automate the migration of your Bitbucket pipelines to GitHub Actions.

* [Migrating from CircleCI with GitHub Actions Importer](/en/actions/tutorials/migrate-to-github-actions/automated-migrations/circleci-migration)

  Learn how to use GitHub Actions Importer to automate the migration of your CircleCI pipelines to GitHub Actions.

* [Migrating from GitLab with GitHub Actions Importer](/en/actions/tutorials/migrate-to-github-actions/automated-migrations/gitlab-migration)

  Learn how to use GitHub Actions Importer to automate the migration of your GitLab pipelines to GitHub Actions.

* [Migrating from Jenkins with GitHub Actions Importer](/en/actions/tutorials/migrate-to-github-actions/automated-migrations/jenkins-migration)

  Learn how to use GitHub Actions Importer to automate the migration of your Jenkins pipelines to GitHub Actions.

* [Migrating from Travis CI with GitHub Actions Importer](/en/actions/tutorials/migrate-to-github-actions/automated-migrations/travis-ci-migration)

  Learn how to use GitHub Actions Importer to automate the migration of your Travis CI pipelines to GitHub Actions.

* [Migrating from Azure Pipelines to GitHub Actions](/en/actions/tutorials/migrate-to-github-actions/manual-migrations/migrate-from-azure-pipelines)

  GitHub Actions and Azure Pipelines share several configuration similarities, which makes migrating to GitHub Actions relatively straightforward.

* [Migrating from CircleCI to GitHub Actions](/en/actions/tutorials/migrate-to-github-actions/manual-migrations/migrate-from-circleci)

  GitHub Actions and CircleCI share several similarities in configuration, which makes migration to GitHub Actions relatively straightforward.

* [Migrating from GitLab CI/CD to GitHub Actions](/en/actions/tutorials/migrate-to-github-actions/manual-migrations/migrate-from-gitlab-cicd)

  GitHub Actions and GitLab CI/CD share several configuration similarities, which makes migrating to GitHub Actions relatively straightforward.

* [Migrating from Jenkins to GitHub Actions](/en/actions/tutorials/migrate-to-github-actions/manual-migrations/migrate-from-jenkins)

  GitHub Actions and Jenkins share multiple similarities, which makes migration to GitHub Actions relatively straightforward.

* [Migrating from Travis CI to GitHub Actions](/en/actions/tutorials/migrate-to-github-actions/manual-migrations/migrate-from-travis-ci)

  GitHub Actions and Travis CI share multiple similarities, which helps make it relatively straightforward to migrate to GitHub Actions.

* [Quickstart for Actions Runner Controller](/en/actions/tutorials/use-actions-runner-controller/quickstart)

  In this tutorial, you'll try out the basics of Actions Runner Controller.

* [Deploying runner scale sets with Actions Runner Controller](/en/actions/tutorials/use-actions-runner-controller/deploy-runner-scale-sets)

  Learn how to deploy runner scale sets with Actions Runner Controller, and use advanced configuration options to tailor Actions Runner Controller to your needs.

* [Authenticating ARC to the GitHub API](/en/actions/tutorials/use-actions-runner-controller/authenticate-to-the-api)

  Learn how to authenticate Actions Runner Controller to the GitHub API.

* [Using Actions Runner Controller runners in a workflow](/en/actions/tutorials/use-actions-runner-controller/use-arc-in-a-workflow)

  You can use Actions Runner Controller runners in a workflow file.

* [Troubleshooting Actions Runner Controller errors](/en/actions/tutorials/use-actions-runner-controller/troubleshoot)

  Learn how to troubleshoot Actions Runner Controller errors.