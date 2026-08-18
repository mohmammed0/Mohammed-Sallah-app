function readPackage(pkg) {
  if (pkg.name === 'metro' && pkg.dependencies?.['image-size']) {
    pkg.dependencies['image-size'] = 'workspace:@sallah/image-size-safe@*';
  }
  return pkg;
}

export const hooks = { readPackage };
