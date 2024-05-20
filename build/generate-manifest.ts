const image = Bun.argv[2];
const tags = process.env.BASE_TAGS!.split(',');
const archs = ['x64', 'arm64'];

const checks = Object.fromEntries(
    await Promise.all(
        tags
            .map((tag) => archs.map((arch) => `${image}:${tag}-${arch}`))
            .flat()
            .map((manifest) =>
                Bun.$`docker manifest inspect ${manifest}`
                    .quiet()
                    .then(() => [manifest, true] as const)
                    .catch(() => [manifest, false] as const)
            )
    )
);

for (const tag of tags) {
    const img = `${image}:${tag}`;
    const manifests = archs.map((arch) => `${image}:${tag}-${arch}`);
    if (!manifests.every((manifest) => checks[manifest])) {
        console.log(`${img} is not ready.`);
        continue;
    }
    Bun.spawnSync({
        cmd: ['docker', 'buildx', 'imagetools', 'create', '-t', img, ...manifests],
        stdout: 'inherit',
        stderr: 'inherit'
    });
}
