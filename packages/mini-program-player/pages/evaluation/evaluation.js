// 实时评估区
var request = require('../../utils/request');

Page({
  data: {
    loaded: false,
    thresholdPassed: false,
    gapText: '',
    combatPower: '--',
    rank: '--',
    qualifierLine: '--',
    combatGap: null,
    suggestions: []
  },

  onLoad: function () {
    this.fetchAssessment();
  },

  fetchAssessment: function () {
    var that = this;
    request.get('/season/qualifier/assessment').then(function (res) {
      if (!res) {
        that.setData({ loaded: true });
        return;
      }

      var combatGap = res.combat_gap !== undefined ? res.combat_gap : res.combatGap;
      var thresholdPassed = res.thresholdPassed !== undefined ? res.thresholdPassed : (combatGap >= 0);

      var gapText = '';
      if (res.gap_text) {
        gapText = res.gap_text;
      } else if (combatGap !== null && combatGap !== undefined && combatGap < 0) {
        gapText = Math.abs(combatGap) + '';
      }

      var suggestions = [];
      if (Array.isArray(res.suggestions)) {
        suggestions = res.suggestions;
      } else if (res.suggestions && Array.isArray(res.suggestions.list)) {
        suggestions = res.suggestions.list;
      }

      that.setData({
        loaded: true,
        thresholdPassed: thresholdPassed,
        gapText: gapText,
        combatPower: res.combatPower || res.combat_power || '--',
        rank: res.rank || res.ranking || '--',
        qualifierLine: res.qualifierLine || res.qualifier_line || '--',
        combatGap: combatGap,
        suggestions: suggestions
      });
    }).catch(function () {
      that.setData({ loaded: true });
    });
  },

  onSuggestionTap: function (e) {
    var url = e.currentTarget.dataset.url;
    if (url) {
      wx.navigateTo({ url: url });
    }
  }
});
