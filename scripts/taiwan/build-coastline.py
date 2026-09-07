import json, math, collections

t=json.load(open('twCounty2010.topo.json'))
sx,sy=t['transform']['scale']; tx,ty=t['transform']['translate']

# 1. 解 delta 編碼，保留整數座標做端點比對（量化格點上等值才可靠）
arcs=[]
for a in t['arcs']:
    x=y=0; pts=[]
    for dx,dy in a:
        x+=dx; y+=dy; pts.append((x,y))
    arcs.append(pts)

geoms=[g for g in t['objects']['layer1']['geometries'] if g.get('type')=='Polygon']

# 2. 數每條 arc 被用幾次。縣市共用的內部界線用兩次，海岸線只用一次
use=collections.Counter()
for g in geoms:
    for ring in g['arcs']:
        for i in ring:
            use[i if i>=0 else ~i]+=1
coast=[i for i,c in use.items() if c==1]
print('arcs 總數',len(arcs),'海岸線 arcs',len(coast))

# 3. 把海岸線 arc 接成封閉環
segs={i:arcs[i] for i in coast}
unused=set(coast); rings=[]
while unused:
    i=unused.pop(); ring=list(segs[i])
    while ring[0]!=ring[-1]:
        end=ring[-1]; nxt=None
        for j in unused:
            s=segs[j]
            if s[0]==end: nxt=(j,s[1:]); break
            if s[-1]==end: nxt=(j,list(reversed(s))[1:]); break
        if nxt is None: break
        unused.discard(nxt[0]); ring+=nxt[1]
    rings.append(ring)
rings.sort(key=len,reverse=True)
print('環數',len(rings),'各環點數',[len(r) for r in rings[:12]])

# 4. 整數轉經緯度，篩掉金門與馬祖（離島太遠會撐爆版面）
def lonlat(p): return (p[0]*sx+tx, p[1]*sy+ty)
keep=[]
for r in rings:
    ll=[lonlat(p) for p in r]
    lo=sum(p[0] for p in ll)/len(ll); la=sum(p[1] for p in ll)/len(ll)
    if lo<119.2 or la>25.45: continue          # 金門 118.3 / 馬祖 26.1
    if len(ll)<6: continue
    keep.append(ll)
print('保留環數',len(keep))

# 5. 投影。範圍小，等距圓柱加 cos 修正即可，視覺上準確
K=math.cos(math.radians(23.6))
def proj(p): return (p[0]*K, -p[1])
prj=[[proj(p) for p in r] for r in keep]

main=max(prj,key=lambda r:(max(p[1] for p in r)-min(p[1] for p in r)))
y0=min(p[1] for p in main); y1=max(p[1] for p in main)
SCALE=700.0/(y1-y0)
allx=[p[0] for r in prj for p in r]
x0=min(allx)
def to_svg(p): return ((p[0]-x0)*SCALE, (p[1]-y0)*SCALE)

# 6. Ramer-Douglas-Peucker 簡化
def rdp(pts,eps):
    if len(pts)<3: return pts
    a,b=pts[0],pts[-1]
    dx,dy=b[0]-a[0],b[1]-a[1]; L=math.hypot(dx,dy)
    idx,dmax=0,-1
    for i in range(1,len(pts)-1):
        p=pts[i]
        d=abs(dy*p[0]-dx*p[1]+b[0]*a[1]-b[1]*a[0])/L if L else math.hypot(p[0]-a[0],p[1]-a[1])
        if d>dmax: idx,dmax=i,d
    if dmax>eps:
        return rdp(pts[:idx+1],eps)[:-1]+rdp(pts[idx:],eps)
    return [a,b]

def d_of(ring,eps):
    pts=[to_svg(p) for p in ring]
    if pts[0]!=pts[-1]: pts.append(pts[0])
    s=rdp(pts,eps)
    return 'M'+' '.join(f'{x:.1f} {y:.1f}' for x,y in s)+'Z', len(s)

EPS=0.55
mi=prj.index(main)
dmain,nmain=d_of(main,EPS)
others=[]
for i,r in enumerate(prj):
    if i==mi: continue
    dd,nn=d_of(r,EPS*0.8)
    others.append(dd)
allpts=[to_svg(p) for r in prj for p in r]
W=max(p[0] for p in allpts)

print('主島點數',nmain,'其他環',len(others))
print('viewBox 0 0',round(W+6,1),'706')
open('isle.txt','w').write('MAIN\n'+dmain+'\n\nOTHERS\n'+'\n'.join(others)+
    f'\n\nVIEWBOX 0 0 {W+6:.1f} 706\nX0 {x0}\nY0 {y0}\nSCALE {SCALE}\nK {K}\n')
print('主島 d 長度',len(dmain),'bytes')

# ── 驗證：把主島與離島畫成 ASCII，確認形狀是台灣 ──
import re
def pts_of(d):
    n=[float(v) for v in re.findall(r'-?\d+\.?\d*',d)]
    return list(zip(n[0::2],n[1::2]))
mainpts=pts_of(dmain)
otherpts=[p for dd in others for p in pts_of(dd)]
COLS,ROWS=46,44
grid=[[' ']*COLS for _ in range(ROWS)]
for x,y in mainpts:
    c=int(x/(W+6)*(COLS-1)); r=int(y/706*(ROWS-1))
    grid[r][c]='#'
for x,y in otherpts:
    c=int(x/(W+6)*(COLS-1)); r=int(y/706*(ROWS-1))
    if grid[r][c]==' ': grid[r][c]='.'
print('\n'.join(''.join(r) for r in grid))

mx0=min(p[0] for p in mainpts); mx1=max(p[0] for p in mainpts)
print(f'\n主島 x 範圍 {mx0:.1f} 到 {mx1:.1f}，寬 {mx1-mx0:.1f}，高 706')
print(f'長寬比 {(mx1-mx0)/706:.3f}（台灣實際約 144km/394km = 0.366）')

CITY={'台北':(121.5654,25.0330),'新竹':(120.9686,24.8066),'台中':(120.6736,24.1477),
 '彰化':(120.5161,24.0809),'嘉義':(120.4491,23.4801),'台南':(120.2270,22.9999),
 '高雄':(120.3014,22.6273),'屏東':(120.4880,22.6690),'花蓮':(121.6015,23.9871),
 '宜蘭':(121.7539,24.7021),'台東':(121.1444,22.7583),'桃園':(121.3010,24.9937),
 '苗栗':(120.8214,24.5602),'雲林':(120.5254,23.7092),'南投':(120.6839,23.9609),
 '基隆':(121.7419,25.1276)}
print('\n城市座標（SVG）：')
out={}
for n,(lo,la) in CITY.items():
    x,y=to_svg(proj((lo,la))); out[n]=(round(x,1),round(y,1))
    print(f'  {n} [{x:.1f},{y:.1f}]')
open('cities.json','w').write(json.dumps(out,ensure_ascii=False))
