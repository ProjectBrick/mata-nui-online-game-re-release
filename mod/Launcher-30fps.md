# Based on:

```
original/lego-re-release/MataNui.zip
	matanui/launcher.swf
```




# Replacing loaded files with 30-FPS variants

## `scripts` -> `frame 2`

Original:

```
loadMovie("player.swf","/");
```

Modified:

```
loadMovie("player-30fps.swf","/");
```
