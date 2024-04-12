# Youtube 通知机器人

这个机器人在有新的 Youtube 影片上传到某个频道时，会向 Discord 频道发送通知。

## 指令

> ### /config `[channel]`
> 配置当前 Discord 群组的全局设置。
> - **channel**: (可选) 当指定时，配置频道的全局设置。

> ### /inspect `<channel>` `[to]`
> 查看一个 Youtube 频道。
> - **channel**: 要查看的 Youtube 频道，可以是 Youtube 链接或频道标识。
> - **to**: (可选) 指定发送通知的频道。

> ### /list `[channel]`
> 列出此频道订阅的 Youtube 频道。
> - **channel**: (可选) 列出指定频道订阅的 Youtube 频道。

> ### /help
> 显示此帮助消息。

## 模板

通知文本使用mustache格式来定制模板，一下提供一些可使用的变量。

- `{{title}}`：影片的标题。
- `{{{url}}}`：影片的链接（必须包含在文本中），使用`{{{`和`}}}`以避免url被转义。
- `{{type}}`：影片的类型，用于区分直播和首播。
- `{{channel}}`：YouTube频道名称。
- `{{timestamp}}`：计划的时间戳，当有直播或首播的计划时可用。此时间戳的格式为unix时间戳，可用于[Discord的时间戳格式](<https://discord.com/developers/docs/reference#message-formatting-timestamp-styles>)，例如：`<t:{{timestamp}}:R>`。

[_机器人源代码_](<https://github.com/eslym/dcyt-bot-v2>)