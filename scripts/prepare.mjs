const major = Number(process.versions.node.split('.')[0]);
if (major < 22 || major >= 25) {
  console.error(`SALLAH requires Node 22-24 LTS; received ${process.version}`);
  process.exit(1);
}
console.log(`SALLAH workspace ready on ${process.version}`);
