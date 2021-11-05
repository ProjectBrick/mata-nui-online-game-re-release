# Based on:

```
original/lego-re-release/projectors/win/autorun.swf
```




# Replacing loaded files with 30-FPS variants

## `scripts` -> `DefineButton2 (15)` -> `BUTTONCONDACTION on(release)`

Original:

```
on(release){
    loadMovie("Launcher-full.swf","/");
}
```

Modified:

```
on(release){
    loadMovie("Launcher-full-30fps.swf","/");
}
```

## `scripts` -> `DefineButton2 (20)` -> `BUTTONCONDACTION on(release)`

Original:

```
on(release){
    loadMovie("Launcher.swf","/");
}
```

Modified:

```
on(release){
    loadMovie("Launcher-30fps.swf","/");
}
```
