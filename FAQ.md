# Frequently Asked Questions (FAQ)

Find answers to some of the most common questions about Project N.O.M.A.D.

## Can I customize the port(s) that NOMAD uses?

Yes, you can customize the ports that NOMAD's core services (Command Center, MySQL, Redis) use. Please refer to the [Advanced Installation](README.md#advanced-installation) section of the README for more details on how to do this.

Note: As of 3/24/2026, only the core services defined in the `docker-compose.yml` file currently support port customization - the installable applications (e.g. Ollama, Kiwix, etc.) do not yet support this, but we have multiple PR's in the works to add this feature for all installable applications in a future release.

## Can I customize the storage location for NOMAD's data?

Yes, you can customize the storage location for NOMAD's content by modifying the `docker-compose.yml` file to adjust the appropriate bind mounts to point to your desired storage location on your host machine. Please refer to the [Advanced Installation](README.md#advanced-installation) section of the README for more details on how to do this.

## Can I store NOMAD's data on an external drive or network storage?

Short answer: yes, but we can't do it for you (and we recommend a local drive for best performance).

Long answer: Custom storage paths, mount points, and external drives (like iSCSI or SMB/NFS volumes) **are possible**, but this will be up to your individual configuration on the host before NOMAD starts, and then passed in via the compose.yml as this is a *host-level concern*, not a NOMAD-level concern (see above for details). NOMAD itself can't configure this for you, nor could we support all possible configurations in the install script.

## Can I run NOMAD on MAC, WSL2, or a non-Debian-based Distro?

See [Why does NOMAD require a Debian-based OS?](#why-does-nomad-require-a-debian-based-os)

## Why does NOMAD require a Debian-based OS?

Project N.O.M.A.D. is currently designed to run on Debian-based Linux distributions (with Ubuntu being the recommended distro) because our installation scripts and Docker configurations are optimized for this environment. While it's technically possible to run the Docker containers on other operating systems that support Docker, we have not tested or optimized the installation process for non-Debian-based systems, so we cannot guarantee a smooth experience on those platforms at this time.

Support for other operating systems will come in the future, but because our development resources are limited as a free and open-source project, we needed to prioritize our efforts and focus on a narrower set of supported platforms for the initial release. We chose Debian-based Linux as our starting point because it's widely used, easy to spin up, and provides a stable environment for running Docker containers.

Community members have provided guides for running N.O.M.A.D. on other platforms (e.g. WSL2, Mac, etc.) in our Discord community and [Github Discussions](https://github.com/flynnty/project-nomad/discussions), so if you're interested in running N.O.M.A.D. on a non-Debian-based system, we recommend checking there for any available resources or guides. However, keep in mind that if you choose to run N.O.M.A.D. on a non-Debian-based system, you may encounter issues that we won't be able to provide support for, and you may need to have a higher level of technical expertise to troubleshoot and resolve any problems that arise.

## Can I run NOMAD on a Raspberry Pi or other ARM-based device?
Project N.O.M.A.D. is currently designed to run on x86-64 architecture, and we have not yet tested or optimized it for ARM-based devices like the Raspberry Pi (and have not published any official images for ARM architecture).

Support for ARM-based devices is on our roadmap, but our initial focus was on x86-64 hardware due to its widespread use and compatibility with a wide range of applications.

Community members have forked and published their own ARM-compatible images and installation guides for running N.O.M.A.D. on Raspberry Pi and other ARM-based devices in our Discord community and [Github Discussions](https://github.com/flynnty/project-nomad/discussions), but these are not officially supported by the core development team, and we cannot guarantee their functionality or provide support for any issues that arise when using these community-created resources.

## What are the hardware requirements for running NOMAD?

Project N.O.M.A.D. itself is quite lightweight and can run on even modest x86-64 hardware, but the tools and resources you choose to install with N.O.M.A.D. will determine the specs required for your unique deployment. Please see the [Hardware Guide](https://www.projectnomad.us/hardware) for detailed build recommendations at various price points.

## Does NOMAD support languages other than English?

As of March 2026, Project N.O.M.A.D.'s UI is only available in English, and the majority of the tools and resources available through N.O.M.A.D. are also primarily in English. However, we have multi-language support on our roadmap for a future release, and we are actively working on adding support for additional languages both in the UI and in the available tools/resources. If you're interested in contributing to this effort, please check out our [CONTRIBUTING.md](CONTRIBUTING.md) file for guidelines on how to get involved.

## What technologies is NOMAD built with?

Project N.O.M.A.D. is built using a combination of technologies, including:
- **Docker:** for containerization of the Command Center and its dependencies
- **Node.js & TypeScript:** for the backend of the Command Center, particularly the [AdonisJS](https://adonisjs.com/) framework
- **React:** for the frontend of the Command Center, utilizing [Vite](https://vitejs.dev/) and [Inertia.js](https://inertiajs.com/) under the hood
- **MySQL:** for the Command Center's database
- **Redis:** for various caching, background jobs, "cron" tasks, and other internal processes within the Command Center

NOMAD makes use of the Docker-outside-of-Docker ("DooD") pattern, which allows the Command Center to manage and orchestrate other Docker containers on the host machine without needing to run Docker itself inside a container. This approach provides better performance and compatibility with a wider range of host environments while still allowing for powerful container management capabilities through the Command Center's UI.

## Can I run NOMAD if I have existing Docker containers on my machine?
Yes, you can safely run Project N.O.M.A.D. on a machine that already has existing Docker containers. NOMAD is designed to coexist with other Docker containers and will not interfere with them as long as there are no port conflicts or resource constraints.

All of NOMAD's containers are prefixed with `nomad_` in their names, so they can be easily identified and managed separately from any other containers you may have running. Just make sure to review the ports that NOMAD's core services (Command Center, MySQL, Redis) use during installation and adjust them if necessary to avoid conflicts with your existing containers.

## Why does NOMAD require access to the Docker socket?

See [What technologies is NOMAD built with?](#what-technologies-is-nomad-built-with)

## Can I use any AI models?
NOMAD by default uses Ollama inside of a docker container to run LLM Models for the AI Assistant. So if you find a model on HuggingFace for example, you won't be able to use that model in NOMAD. The list of available models in the AI Assistant settings (/settings/models) may not show all of the models you are looking for. If you found a model from https://ollama.com/search that you'd like to try and its not in the settings page, you can use a curl command to download the model.  
`curl -X POST -H "Content-Type: application/json" -d '{"model":"MODEL_NAME_HERE"}' http://localhost:8080/api/ollama/models` replacing MODEL_NAME_HERE with the model name from whats in the ollama website.

## Do I have to install the AI features in NOMAD?

No, the AI features in NOMAD (Ollama, Qdrant, custom RAG pipeline, etc.) are all optional and not required to use the core functionality of NOMAD.

## Is NOMAD actually free? Are there any hidden costs?
Yes, Project N.O.M.A.D. is completely free and open-source software licensed under the Apache License 2.0. There are no hidden costs or fees associated with using NOMAD itself, and we don't have any plans to introduce "premium" features or paid tiers.

Aside from the cost of the hardware you choose to run it on, there are no costs associated with using NOMAD.

## Do you sell hardware or pre-built devices with NOMAD pre-installed?

No, we do not sell hardware or pre-built devices with NOMAD pre-installed at this time. Project N.O.M.A.D. is a free and open-source software project, and we provide detailed installation instructions and hardware recommendations for users to set up their own NOMAD instances on compatible hardware of their choice. The tradeoff to this DIY approach is some additional setup time and technical know-how required on the user's end, but it also allows for greater flexibility and customization in terms of hardware selection and configuration to best suit each user's unique needs, budget, and preferences.

## How quickly are issues resolved when reported?

We strive to address and resolve issues as quickly as possible, but please keep in mind that Project N.O.M.A.D. is a free and open-source project maintained by a small team of volunteers. We prioritize issues based on their severity, impact on users, and the resources required to resolve them. Critical issues that affect a large number of users are typically addressed more quickly, while less severe issues may take longer to resolve. Aside from the development efforts needed to address the issue, we do our best to conduct thorough testing and validation to ensure that any fix we implement doesn't introduce new issues or regressions, which also adds to the time it takes to resolve an issue.

We also encourage community involvement in troubleshooting and resolving issues, so if you encounter a problem, please consider checking our Discord community and Github Discussions for potential solutions or workarounds while we work on an official fix.

## How often are new features added or updates released?

We aim to release updates and new features on a regular basis, but the exact timing can vary based on the complexity of the features being developed, the resources available to our volunteer development team, and the feedback and needs of our community. We typically release smaller "patch" versions more frequently to address bugs and make minor improvements, while larger feature releases may take more time to develop and test before they're ready for release.

## I opened a PR to contribute a new feature or fix a bug. How long does it usually take for PRs to be reviewed and merged?
We appreciate all contributions to the project and strive to review and merge pull requests (PRs) as quickly as possible. The time it takes for a PR to be reviewed and merged can vary based on several factors, including the complexity of the changes, the current workload of our maintainers, and the need for any additional testing or revisions.

Because NOMAD is still a young project, some PRs (particularly those for new features) may take longer to review and merge as we prioritize building out the core functionality and ensuring stability before adding new features. However, we do our best to provide timely feedback on all PRs and keep contributors informed about the status of their contributions.

## I have a question that isn't answered here. Where can I ask for help?

If you have a question that isn't answered in this FAQ, please feel free to ask for help in our Discord community (https://discord.com/invite/crosstalksolutions) or on our Github Discussions page (https://github.com/flynnty/project-nomad/discussions).

## I have a suggestion for a new feature or improvement. How can I share it?

We welcome and encourage suggestions for new features and improvements! We highly encourage sharing your ideas (or upvoting existing suggestions) on our public roadmap at https://roadmap.projectnomad.us, where we track new feature requests. This is the best way to ensure that your suggestion is seen by the development team and the community, and it also allows other community members to upvote and show support for your idea, which can help prioritize it for future development.
