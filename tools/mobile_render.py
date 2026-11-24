"""Apply narrow renderer fixes to the compiled version used by the mobile entry."""


def patch_renderers(source):
    def replace(text, before, after):
        if text.count(before) != 1:
            raise ValueError(f'Expected one renderer fragment: {before[:120]}')
        return text.replace(before, after, 1)

    # The game uses detached Image elements here, which the document's
    # image replacement observer cannot see.
    start = source.index('/* twine-user-script #19:')
    end = source.index('/* twine-user-script #20:', start)
    renderer = source[start:end]
    renderer = replace(renderer, '\t\t\t\timage.src = src;', '''
                const artwork = window.DOLMobileArt?.source(src);
                if (!artwork) {
                    image.src = src;
                    return;
                }
                artwork.then(({src: url, release}) => {
                    const loaded = image.onload;
                    const failed = image.onerror;
                    image.onload = () => { release(); loaded(); };
                    image.onerror = event => { release(); failed(event); };
                    image.src = url;
                }, error => errorCallback(src, layer, error));'''.rstrip())
    # A newer composition owns the same canvas even if an earlier set of
    # images finishes later.
    renderer = replace(renderer, '\tfunction composeLayers(targetCanvas, layerSpecs, frameCount, listener) {', '''
    const currentComposition = new WeakMap();
    function composeLayers(targetCanvas, layerSpecs, frameCount, listener) {
        const composition = {};
        currentComposition.set(targetCanvas, composition);'''.rstrip())
    renderer = replace(renderer, '\t\t\tif (rendered) return;',
                       '\t\t\tif (rendered || currentComposition.get(targetCanvas) !== composition) return;')
    renderer = replace(renderer, '\t\t\t\t\t// Mark this src as erroneous to avoid blinking due to reload attempts', """
                    if (error?.dolArtwork) {
                        // Preserve the previous canvas and retry on the next composition.
                        rendered = true;
                        return;
                    }
                    // Mark this src as erroneous to avoid blinking due to reload attempts""".rstrip())
    source = source[:start] + renderer + source[end:]

    # Weather uses a separate detached-image cache.
    start = source.index('const ImageCache = (() => {')
    end = source.index('window.ImageCache = ImageCache;', start)
    weather_cache = replace(source[start:end], '\t\timage.src = src;', '''
        const artwork = window.DOLMobileArt?.source(src);
        if (!artwork) {
            image.src = src;
        } else {
            artwork.then(({src: url, release}) => {
                const loaded = image.onload;
                const failed = image.onerror;
                image.onload = () => { release(); loaded(); };
                image.onerror = event => { release(); failed(event); };
                image.src = url;
            }, error => {
                cacheEntries.delete(src);
                rejectPromise(error);
            });
        }'''.rstrip())
    source = source[:start] + weather_cache + source[end:]

    # Bind the entire async animation load to the location it started in.
    start = source.index('name: "locationImageAnimation",')
    end = source.index('\n\tonEnable()', start)
    effect = source[start:end]
    effect = replace(effect, '\t\tconst loadImage = async (key, obj) => {', '''
        const location = this.location;
        const locationKey = this.key;
        const basePath = this.fullPath;
        const animations = this.animations = new Map();
        const stillCurrent = () => this.animations === animations && this.fullPath === basePath && this.key === locationKey;
        const loadImage = async (key, obj) => {
            if (!stillCurrent()) return;'''.rstrip())
    effect = replace(effect, '\t\t\t\tconst basePath = this.fullPath;\n', '')
    effect = replace(effect, '\t\t\t\tconst handleLoadedImage = image => {',
                        '\t\t\t\tconst handleLoadedImage = image => {\n\t\t\t\t\tif (!stillCurrent()) return resolve();')
    begin = effect.index('\t\t\t\t\t.catch(() => {')
    finish = effect.index('\n\t\t\t});', begin)
    effect = effect[:begin] + '''                    .catch(() => {
                        if (stillCurrent()) Errors.report("Warning: Missing location image: " + resolvedSrc);
                        resolve();
                    });''' + effect[finish:]
    effect = replace(effect, '''\t\tthis.animations = new Map();
\t\tif (this.location?.[this.key] === undefined) return;

\t\t// Need to create a deep copy in case of other effects using the same object
\t\tthis.obj = this.location[this.key].deepCopy();''', '''        if (location?.[locationKey] === undefined) return;

        // Copy the configuration before any asynchronous image loads.
        this.obj = location[locationKey].deepCopy();''')
    effect = replace(effect, 'for (const key in this.obj) {\n\t\t\t\tconst obj = this.obj[key];',
                       'for (const [key, obj] of Object.entries(this.obj)) {')
    return source[:start] + effect + source[end:]
