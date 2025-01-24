# code2ghost README

<!-- market link -->

This is a VSCode plugin used to upload the currently opened markdown file to your [GhostCMS](https://ghost.org/) via the [Ghost API](https://ghost.org/docs/admin-api). I have never . This plugin has not been widely tested yet, please feel free to submit issues or contribute code.

## How to use

1. Install the extension in code.
2. Go to the settings and find `Code2Ghost: Secret Key`, then generate a sufficiently long secret key. Please try to avoid using the default value.
3. Go to the backend setting of your Ghost website, find the `Integrations` tab under `Advanced`, and add a new custom integration. Typically, this can be found at: <https://your.ghost.website/ghost/#/settings/integrations/new>
4. Run the command `Code2Ghost: Set Config` to set the `API URL` and `Admin API key`. The admin key will be stored in the VSCode `globalState` using AES-256-CBC encryption.
5. Open the markdown file you want to post and stay focus on it. Run `Code2Ghost: Create and Draft Post Using Current Editor's File` or `Code2Ghost: Create and Publish Post Using Current Editor's File` and wait, you will get a link to the post if the post is created successful.
