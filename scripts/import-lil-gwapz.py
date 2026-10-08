"""Import approved PNG bytes unchanged; only responsive WebP previews are resampled."""
import csv, hashlib, io, json, sys, zipfile
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]
target=root/"public/lil-gwapz/r01-v1"
for d in ("originals","previews"): (target/d).mkdir(parents=True,exist_ok=True)
# Six filename/slot errors in the archive, verified against the approved images.
remap={"LG-R01-011-F":"LG-R01-012-M","LG-R01-012-M":"LG-R01-011-F",
       "LG-R01-013-M":"LG-R01-013-F","LG-R01-013-F":"LG-R01-013-M",
       "LG-R01-014-M":"LG-R01-014-F","LG-R01-014-F":"LG-R01-014-M"}
assets={}
with zipfile.ZipFile(sys.argv[1]) as z:
 rows=list(csv.DictReader(io.StringIO(z.read("MANIFEST.csv").decode())))
 assert len(rows)==152
 bykey={r["reaction_id"]+"-"+r["sex"]:r for r in rows}
 for i,r in enumerate(rows):
  key=r["reaction_id"]+"-"+r["sex"]; src=bykey[remap.get(key,key)]
  member=("male/" if src["sex"]=="M" else "female/")+src["source_filename"]
  raw=z.read(member); sha=hashlib.sha256(raw).hexdigest()
  assert sha==src["source_sha256"]
  im=Image.open(io.BytesIO(raw))
  assert im.size==(1254,1254) and im.mode=="RGBA" and im.getchannel("A").getextrema()==(0,255)
  name=r["source_filename"]; (target/"originals"/name).write_bytes(raw)
  for size in (384,768,1254):
   out=im if size==1254 else im.resize((size,size),Image.Resampling.LANCZOS)
   encoded=io.BytesIO(); out.save(encoded,format="WEBP",quality=94,method=5)
   preview=encoded.getvalue(); assert len(preview)>100
   path=target/"previews"/(Path(name).stem+"-"+str(size)+".webp")
   path.write_bytes(preview); assert path.stat().st_size==len(preview)
  assets[key]={"filename":name,"width":1254,"height":1254,"bytes":len(raw),"sha256":sha,"sourceArchiveMember":member}
  if (i+1)%38==0: print("Imported",i+1,"/152",flush=True)
assert len(set(a["sha256"] for a in assets.values()))==152
(root/"app/lib/lil-gwapz-assets.generated.json").write_text(json.dumps(assets,indent=2)+"\n")
