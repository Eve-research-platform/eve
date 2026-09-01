'use strict';

(function(global){
  const THEMES=Object.freeze({
    default:{id:'default',name:'Default',description:'Eve’s calm, modern participant experience.'},
    gds:{id:'gds',name:'GDS',description:'A GOV.UK Design System-inspired participant experience.'}
  });

  function studyPresentationTheme(study,receipt=null){
    const raw=String(receipt?.theme||study?.settings?.presentationTheme||'default').toLowerCase();
    return THEMES[raw]?raw:'default';
  }

  function studyThemeClass(study,receipt=null){
    return `study-theme-${studyPresentationTheme(study,receipt)}`;
  }

  function studyThemeSettingsMarkup(study){
    const active=studyPresentationTheme(study);
    const card=(id,name,description,preview)=>`
      <button type="button" class="study-theme-choice ${active===id?'selected':''}" aria-pressed="${active===id?'true':'false'}"
        onclick="sSetting('presentationTheme','${id}');render();toast('${name} participant theme selected',1800,'success')">
        <span class="study-theme-preview study-theme-preview-${id}" aria-hidden="true">${preview}</span>
        <span class="study-theme-choice-copy"><b>${name}</b><small>${description}</small></span>
        <span class="study-theme-selected" aria-hidden="true">${active===id?'✓':''}</span>
      </button>`;

    return `<section class="card settings-card study-theme-settings">
      <div class="settings-card-icon" aria-hidden="true">Aa</div>
      <div class="section-label">PRESENTATION</div>
      <h3>Participant theme</h3>
      <p>Choose how this study looks to participants. The theme is saved with the study and included in every published version.</p>
      <div class="study-theme-grid" role="group" aria-label="Participant theme">
        ${card('default',THEMES.default.name,THEMES.default.description,'<i></i><strong>Research study</strong><span></span><em></em>')}
        ${card('gds',THEMES.gds.name,THEMES.gds.description,'<i></i><strong>Research study</strong><span></span><em></em>')}
      </div>
      <div class="study-theme-actions"><button type="button" class="btn subtle" onclick="state.previewVersion='draft';state.previewScope='study';state.preview=true;render()">Preview participant theme</button><span class="muted">Current: <b>${THEMES[active].name}</b></span></div>
      <div class="settings-note study-theme-note">${active==='gds'
        ? 'GDS uses GOV.UK-style colours, spacing, form controls and focus states. It does not add GOV.UK branding or the Crown logo.'
        : 'Default keeps Eve’s existing participant styling.'}</div>
    </section>`;
  }

  global.EveStudyThemes={themes:THEMES,normalize:studyPresentationTheme,className:studyThemeClass,settingsMarkup:studyThemeSettingsMarkup};
  global.studyPresentationTheme=studyPresentationTheme;
  global.studyThemeClass=studyThemeClass;
  global.studyThemeSettingsMarkup=studyThemeSettingsMarkup;
})(globalThis);
