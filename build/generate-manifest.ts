const image = Bun.argv[2];
const baseTags = process.env.BASE_TAGS!.split(',');
const archs = ['x64', 'arm64'];
const sha = process.env.GITHUB_SHA!.substring(0, 7);

const checks = Object.fromEntries(
    await Promise.all(
        archs
            .map((arch) => `${image}:${sha}-${arch}`)
            .map((manifest) =>
                Bun.$`docker manifest inspect ${manifest}`
                    .quiet()
                    .then(() => [manifest, true] as const)
                    .catch(() => [manifest, false] as const)
            )
    )
);

if (!Object.values(checks).every(Boolean)) {
    console.log('source images not ready.');
    process.exit(0);
}

const tags = baseTags.map((t) => ['-t', `${image}:${t}`]).flat();

Bun.spawnSync({
    cmd: ['docker', 'buildx', 'imagetools', 'create', ...tags, ...Object.keys(checks)],
    stdout: 'inherit',
    stderr: 'inherit'
});
