-- Wedstrijden zaterdag 7 november 2026 op Sportpark De Schuytgraaf (test, bron: voetbal.nl, opgehaald 6-11-2026)
-- Eindtijd = aanvang + bezettingsduur per leeftijd. Status 'akkoord': ze zijn al bij de KNVB vastgelegd.
begin;
delete from public.cap_matches where datum = '2026-11-07' and bron = 'voetbal.nl';
insert into public.cap_matches (datum,start_time,end_time,thuis,uit,team_id,leeftijd,units,deel,kk_thuis,kk_uit,status,wedstrijdnr,bron) values
  ('2026-11-07','08:30','08:50','SDOO O7-2','ESA O7-5',null,7,array['HV-A1']::text[],0.5,null,'1','akkoord','81573','voetbal.nl'),
  ('2026-11-07','08:30','08:50','v.v. Dieren O7-2','Arnhemse Boys Schuytgraaf O7-3','O7-3',7,array['HV-A1']::text[],0.5,null,'1','akkoord','81534','voetbal.nl'),
  ('2026-11-07','08:30','09:30','Arnhemse Boys Schuytgraaf O9-1JM','ESA O9-1','O9-1',9,array['KG2-A1']::text[],1,null,'3','akkoord','83890','voetbal.nl'),
  ('2026-11-07','08:30','09:30','Arnhemse Boys Schuytgraaf O8-2JM','sv DFS O8-2JM','O8-2',8,array['HV-B2']::text[],1,null,'2','akkoord','83103','voetbal.nl'),
  ('2026-11-07','08:30','09:30','Arnhemse Boys O9-4JM','OVC ''85 O9-2','O9-4',9,array['KG2-A2']::text[],1,null,'6','akkoord','99501','voetbal.nl'),
  ('2026-11-07','08:30','09:45','Arnhemse Boys Schuytgraaf O10-5','OVC ''85 O10-4JM','O10-5',10,array['KG3-A1']::text[],1,null,'5','akkoord','106067','voetbal.nl'),
  ('2026-11-07','08:30','09:30','Arnhemse Boys Schuytgraaf O8-5','ESA O8-5','O8-5',8,array['HV-B1']::text[],1,null,'4','akkoord','85946','voetbal.nl'),
  ('2026-11-07','08:30','09:45','Arnhemse Boys Schuytgraaf O11-3','SCW ''23 O11-2','O11-3',11,array['KG3-B1', 'KG3-B2']::text[],1,null,'5','akkoord','101031','voetbal.nl'),
  ('2026-11-07','08:30','09:45','Arnhemse Boys Schuytgraaf O10-4','Spero O10-4','O10-4',10,array['KG2-B2']::text[],1,null,'3','akkoord','85146','voetbal.nl'),
  ('2026-11-07','08:30','09:30','Arnhemse Boys O9-5JM','DVV O9-4','O9-5',9,array['KG2-B1']::text[],1,null,'2','akkoord','98343','voetbal.nl'),
  ('2026-11-07','08:30','09:30','Arnhemse Boys Schuytgraaf O8-4','RKSV Driel O8-2JM','O8-4',8,array['HV-A2']::text[],1,null,'4','akkoord','96703','voetbal.nl'),
  ('2026-11-07','08:50','09:10','ESA O7-5','v.v. Dieren O7-2',null,7,array['HV-A1']::text[],0.5,'1',null,'akkoord','81590','voetbal.nl'),
  ('2026-11-07','08:50','09:10','Arnhemse Boys Schuytgraaf O7-3','SDOO O7-2','O7-3',7,array['HV-A1']::text[],0.5,null,'1','akkoord','81641','voetbal.nl'),
  ('2026-11-07','09:10','09:30','ESA O7-5','Arnhemse Boys Schuytgraaf O7-3','O7-3',7,array['HV-A1']::text[],0.5,'1',null,'akkoord','81613','voetbal.nl'),
  ('2026-11-07','09:10','09:30','v.v. Dieren O7-2','SDOO O7-2',null,7,array['HV-A1']::text[],0.5,'1','1','akkoord','81511','voetbal.nl'),
  ('2026-11-07','10:00','11:15','Arnhemse Boys Schuytgraaf O11-2','RKHVV O11-5','O11-2',11,array['KG2-A1', 'KG2-A2']::text[],1,null,'8','akkoord','84930','voetbal.nl'),
  ('2026-11-07','10:00','11:30','Arnhemse Boys Schuytgraaf O12-2','Spero O12-2','O12-2',12,array['KG2-B1', 'KG2-B2']::text[],1,null,'7','akkoord','94817','voetbal.nl'),
  ('2026-11-07','10:00','11:30','Arnhemse Boys Schuytgraaf O13-2JM','DVOL O13-4','O13-2',13,array['HV-A1', 'HV-A2', 'HV-B1', 'HV-B2']::text[],1,'11','12','akkoord','106282','voetbal.nl'),
  ('2026-11-07','10:00','11:30','Arnhemse Boys Schuytgraaf O12-4JM','SML O12-3','O12-4',12,array['KG3-A1', 'KG3-A2']::text[],1,null,'8','akkoord','108514','voetbal.nl'),
  ('2026-11-07','12:00','13:45','Arnhemse Boys Schuytgraaf O14-1JM','Blauw Geel''38/JUMBO O14-1','O14-1',14,array['HV-A1', 'HV-A2', 'HV-B1', 'HV-B2']::text[],1,'5','6','akkoord',null,'voetbal.nl'),
  ('2026-11-07','12:00','13:45','Arnhemse Boys Schuytgraaf O14-2','Bennekom O14-3','O14-2',14,array['KG2-A1', 'KG2-A2', 'KG2-B1', 'KG2-B2']::text[],1,'3','4','akkoord',null,'voetbal.nl'),
  ('2026-11-07','12:00','13:45','Arnhemse Boys Schuytgraaf O15-2','SCW ''23 O15-1','O15-2',15,array['KG3-A1', 'KG3-A2', 'KG3-B1', 'KG3-B2']::text[],1,'1','2','akkoord','96064','voetbal.nl'),
  ('2026-11-07','14:15','16:15','Arnhemse Boys Schuytgraaf O17-1','DVOV O17-1','O17-1',17,array['HV-A1', 'HV-A2', 'HV-B1', 'HV-B2']::text[],1,'7','8','akkoord',null,'voetbal.nl'),
  ('2026-11-07','14:15','16:15','Arnhemse Boys Schuytgraaf O17-2','SDOO O17-1','O17-2',17,array['KG2-A1', 'KG2-A2', 'KG2-B1', 'KG2-B2']::text[],1,'11','12','akkoord','92522','voetbal.nl'),
  ('2026-11-07','14:15','16:15','Arnhemse Boys Schuytgraaf O16-3','Zeewolde O16-1','O16-3',16,array['KG3-A1', 'KG3-A2', 'KG3-B1', 'KG3-B2']::text[],1,'5','6','akkoord',null,'voetbal.nl'),
  ('2026-11-07','16:30','18:45','Arnhemse Boys Schuytgraaf O19-1','Orion O19-2','O19-1',19,array['HV-A1', 'HV-A2', 'HV-B1', 'HV-B2']::text[],1,'1','2','akkoord',null,'voetbal.nl'),
  ('2026-11-07','16:30','18:30','Arnhemse Boys Schuytgraaf O16-2','Eldenia O16-2','O16-2',16,array['KG3-A1', 'KG3-A2', 'KG3-B1', 'KG3-B2']::text[],1,'5','6','akkoord','92868','voetbal.nl'),
  ('2026-11-07','16:30','18:45','Arnhemse Boys Schuytgraaf O19-3','DVOL O19-1','O19-3',19,array['KG2-A1', 'KG2-A2', 'KG2-B1', 'KG2-B2']::text[],1,'3','4','akkoord','91985','voetbal.nl');
commit;
select count(*) as wedstrijden_7nov from public.cap_matches where datum='2026-11-07';
