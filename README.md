# code2ghost README

[View my blog at my Ghost](https://necro.dedfaf.tech/guan-yu-code2ghost-2/)

<https://marketplace.visualstudio.com/items?itemName=dedfaf.code2ghost>

This is a VSCode plugin used to upload the currently opened markdown file to your [GhostCMS](https://ghost.org/) via the [Ghost API](https://ghost.org/docs/admin-api). This plugin has not been widely tested yet, please feel free to submit issues or contribute code.

## WARNING

The extension is on a very early stage, so many function is not working right now.

The extension converts markdown files to html first. Currently **only texts and images in markdown file is supported**.

~~The extension detects title of the post by using regular expressions to determine the content between `<h1>` and `</h1>`. If your markdown has more than two top titles, the content would go wrong.~~

2025.2.24: if `title` is provided in front-matter, title won't be asked when creating post. I suggest to set title in front matter instead of using h1.

**Since the extension is in early dev, the version in marketplace will usually be outdated, please always build from the source**

## Features

## How to use

1. Install the extension in code.
2. Go to the settings and find `Code2Ghost: Secret Key`, then generate a sufficiently long secret key. Please try to avoid using the default value.
3. Go to the backend setting of your Ghost website, find the `Integrations` tab under `Advanced`, and add a new custom integration. Typically, this can be found at: <https://your.ghost.website/ghost/#/settings/integrations/new>
4. Run the command `Code2Ghost: Set Config` (press ctrl+alt+p or F1) to set the `API URL` and `Admin API key`. The admin key will be stored in the VSCode `globalState` using AES-256-CBC encryption.
5. Open the markdown file you want to post and stay focus on it. Run `Code2Ghost: Create and Draft Post Using Current Editor's File` or `Code2Ghost: Create and Publish Post Using Current Editor's File` and wait, you will get a link to the post if the post is created successful.

### Update process

The update Process: 
1. run `Code2Ghost: Get Post in new tab` to get the post you want to update. 

    This will gets you new editor tab with front matter (contains post `id` & `updated_at`), which is needed for the update process.
    - Or run `Code2Ghost: Sync Post By Post id provided in front-matter (Current editor)`
2. run `Code2Ghost: Update Post Using Current Editor's file` and wait, you will get a link to the post if the post is updated successful.

> Currently, every time a post is created or updated, the local markdown file is also automatically synced. The sync action aim for 2 purpose:
> - To update `updated_at` in front-matter in order to update the post Continuously.
> - To convert the local markdown image links into URLs used by Ghost. Otherwise, if the post is updated again using the same file, the local images will be uploaded repeatedly.
