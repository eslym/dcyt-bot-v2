# Youtube 通知機器人

這個機器人在有新的 Youtube 影片上傳到某個頻道時，會向 Discord 頻道發送通知。

## 指令

> ### /config `[channel]`
> 配置當前 Discord 群組的全局設置。
> - **channel**: (可選) 當指定時，配置頻道的全局設置。

> ### /inspect `<channel>` `[to]`
> 查看一個 Youtube 頻道。
> - **channel**: 要查看的 Youtube 頻道，可以是 Youtube 連結或頻道標識。
> - **to**: (可選) 指定發送通知的頻道。

> ### /list `[channel]`
> 列出此頻道訂閱的 Youtube 頻道。
> - **channel**: (可選) 列出指定頻道訂閱的 Youtube 頻道。

> ### /help
> 顯示此幫助訊息。

## 模板

通知文本使用mustache格式來定制模板，以下提供一些可使用的變量。

- `{{title}}`：影片的標題。
- `{{{url}}}`：影片的連結（必須包含在文本中），使用`{{{`和`}}}`以避免url被轉義。
- `{{type}}`：影片的類型，用於區分直播和首播。
- `{{channel}}`：YouTube頻道名稱。
- `{{timestamp}}`：計劃的時間戳，當有直播或首播的計劃時可用。此時間戳的格式為unix時間戳，可用於[Discord的時間戳格式](<https://discord.com/developers/docs/reference#message-formatting-timestamp-styles>)，例如：`<t:{{timestamp}}:R>`。