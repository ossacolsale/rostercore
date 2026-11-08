#!/usr/bin/env python3
"""Fetch pinned C++ dependencies; use --source for portable OR-Tools builds."""
import argparse, hashlib, json, os, platform, shutil, subprocess, tarfile, urllib.request, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DEPS=ROOT/'.deps'
VERSION='9.15'

def download(url,destination,headers=None):
 print('Downloading',url,flush=True)
 request=urllib.request.Request(url,headers={'User-Agent':'RosterCore-bootstrap',**(headers or {})})
 with urllib.request.urlopen(request,timeout=240) as response,destination.open('wb') as out:shutil.copyfileobj(response,out)

def unpack(archive,destination):
 temp=DEPS/'unpack';shutil.rmtree(temp,ignore_errors=True);temp.mkdir()
 if zipfile.is_zipfile(archive):
  with zipfile.ZipFile(archive) as z:
   for name in z.namelist():
    if not (temp/name).resolve().is_relative_to(temp.resolve()):raise ValueError('Unsafe archive path')
   z.extractall(temp)
 else:
  with tarfile.open(archive) as t:t.extractall(temp,filter='data')
 entries=list(temp.iterdir());source=entries[0] if len(entries)==1 and entries[0].is_dir() else temp
 if destination.exists():shutil.rmtree(destination)
 shutil.move(str(source),str(destination));shutil.rmtree(temp,ignore_errors=True)

def source_dependency(name,url):
 dest=DEPS/name
 if dest.exists():return
 archive=DEPS/(name+'.tar.gz');download(url,archive);unpack(archive,dest)

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--source',action='store_true',help='Build OR-Tools from source (recommended Windows/macOS)');parser.add_argument('--jobs',default='2');args=parser.parse_args();DEPS.mkdir(exist_ok=True)
 source_dependency('json','https://codeload.github.com/nlohmann/json/tar.gz/refs/tags/v3.12.0')
 source_dependency('json-schema-validator','https://codeload.github.com/pboettch/json-schema-validator/tar.gz/refs/tags/2.4.0')
 dest=DEPS/'ortools'
 if not dest.exists() or not any(dest.iterdir()):
  if args.source or platform.system()!='Linux' or platform.machine() not in ('x86_64','AMD64'):
   source_dependency('or-tools-source',f'https://codeload.github.com/google/or-tools/tar.gz/refs/tags/v{VERSION}')
   build=DEPS/'or-tools-build'
   cmd=['cmake','-S',str(DEPS/'or-tools-source'),'-B',str(build),'-DCMAKE_BUILD_TYPE=Release',f'-DCMAKE_INSTALL_PREFIX={dest}','-DBUILD_DEPS=ON','-DBUILD_SAMPLES=OFF','-DBUILD_EXAMPLES=OFF','-DBUILD_TESTING=OFF','-DUSE_SCIP=OFF','-DUSE_COINOR=OFF','-DUSE_HIGHS=OFF']
   subprocess.run(cmd,check=True);subprocess.run(['cmake','--build',str(build),'--config','Release','--parallel',args.jobs],check=True);subprocess.run(['cmake','--install',str(build),'--config','Release'],check=True)
  else:
   metadata=DEPS/'release.json';download(f'https://api.github.com/repos/google/or-tools/releases/tags/v{VERSION}',metadata)
   release=json.loads(metadata.read_text());name='or-tools_amd64_ubuntu-24.04_cpp_v9.15.6755.tar.gz';asset=next(a for a in release['assets'] if a['name']==name)
   archive=DEPS/name;download(asset['url']+'?download=1',archive,{'Accept':'application/octet-stream'})
   digest=asset.get('digest','')
   if digest.startswith('sha256:') and hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()!=digest.removeprefix('sha256:'):raise ValueError('OR-Tools download digest mismatch')
   unpack(archive,dest)
 print('Dependencies ready. Run cmake --preset dev && cmake --build --preset dev')
if __name__=='__main__':main()
