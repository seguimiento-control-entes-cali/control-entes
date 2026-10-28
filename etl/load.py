import openpyxl, pandas as pd, re, datetime as dt
# Rutas de los Excel de control. Se sobrescriben desde run_etl.py (ver README).
FILES={2024:'data/control_2024.xlsx',2025:'data/control_2025.xlsx',2026:'data/control_2026.xlsx'}
def clean(v):
    if v is None: return None
    if isinstance(v,str):
        v=re.sub(r'\s+',' ',v.replace('\xa0',' ')).strip()
        return v if v not in ('','-') else None
    return v
# Columnas esperadas en la hoja CONTROL de 2026 (posición: texto que debe contener el encabezado, sin tildes)
ENC_2026 = {0:'no. orden',1:'radicado ente',2:'ente externo',3:'radicacion en',4:'fecha radicacion',5:'clase',6:'organismo',
            7:'asunto',8:'dias habiles',9:'fecha maxima',10:'orfeo',11:'fecha de respuesta',12:'estado',13:'observaciones'}
def _fold(s):
    import unicodedata
    s=unicodedata.normalize('NFKD',str(s or '')); return re.sub(r'\s+',' ',''.join(c for c in s if not unicodedata.combining(c)).lower()).strip()
def fila_inicio(ws, vig):
    """Fila donde empiezan los datos: la siguiente a la que tiene 'No. Orden' en la columna A.
    Así el ETL sigue funcionando si el Excel agrega o quita filas de título arriba de la tabla."""
    for i,r in enumerate(ws.iter_rows(min_row=1,max_row=15,values_only=True),1):
        if _fold(r[0]).startswith('no. orden') or _fold(r[0])=='no orden':
            if vig>=2026:
                faltan=[f'{chr(65+c)}: "{t}"' for c,t in ENC_2026.items() if t not in _fold(r[c] if c<len(r) else '')]
                if faltan: raise ValueError(f'Vigencia {vig}: la hoja CONTROL cambió de columnas en la fila {i}. No coinciden: '+'; '.join(faltan))
            return i+1
    return 6   # formato histórico 2024-2025
def load(vig):
    wb=openpyxl.load_workbook(FILES[vig],data_only=True); ws=wb['CONTROL']; rows=[]
    ini=fila_inicio(ws,vig)
    for i,r in enumerate(ws.iter_rows(min_row=ini,values_only=True),ini):
        r=[clean(c) for c in r]
        if vig<2026:
            if not any(r[1:15]): continue
            rows.append(dict(vigencia=vig,hoja='CONTROL',fila_excel=i,orden=r[0],rad_ente=r[1],fecha_oficio=r[2],ente=r[3],orfeo_entrada=r[4],fecha_radicacion=r[5],fecha_daci=r[6],dirigido=r[7],asunto=r[8],dias_habiles=r[9],fecha_max=r[10],responde=r[11],orfeo_resp=r[12],fecha_resp=r[13],estado=r[14],obs=r[15],clase=None))
        else:
            if not any(r[1:13]): continue
            rows.append(dict(vigencia=vig,hoja='CONTROL',fila_excel=i,orden=r[0],rad_ente=r[1],fecha_oficio=None,ente=r[2],orfeo_entrada=r[3],fecha_radicacion=r[4],fecha_daci=None,dirigido=r[6],asunto=r[7],dias_habiles=r[8],fecha_max=r[9],responde=None,orfeo_resp=r[10],fecha_resp=r[11],estado=r[12],obs=r[13],clase=r[5]))
    return pd.DataFrame(rows)
def load_norespuesta(vig):
    wb=openpyxl.load_workbook(FILES[vig],data_only=True); ws=wb['NO RESPUESTA']; rows=[]
    for i,r in enumerate(ws.iter_rows(min_row=6,values_only=True),6):
        r=[clean(c) for c in r]
        if not any(r[1:9]): continue
        rows.append(dict(vigencia=vig,fila_excel=i,orden=r[0],rad_ente=r[1],fecha_oficio=r[2],ente=r[3],orfeo_entrada=r[4],fecha_radicacion=r[5],fecha_daci=r[6],dirigido=r[7],asunto=r[8],traslado=r[9] if len(r)>9 else None))
    return pd.DataFrame(rows)
