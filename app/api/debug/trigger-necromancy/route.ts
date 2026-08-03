// Route de debug temporaire -- contourne le mur SSO Vercel Deployment Protection en
// import direct de la fonction exportée, jamais de self-fetch HTTP. Supprimée après
// vérification (même pattern que tout le chantier CHANTIER FINAL de cette semaine).
import { NextResponse } from 'next/server'
import { runWikiReferentialSync } from '../../../cron/wiki-referential-sync/route'

export async function GET() {
  const result = await runWikiReferentialSync()
  return NextResponse.json(result)
}
