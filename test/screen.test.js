const { expect } = require('chai');

describe('Screen Sharing Tests', () => {
  it('should check if getDisplayMedia is available', () => {
    expect(navigator.mediaDevices).to.exist;
    expect(navigator.mediaDevices.getDisplayMedia).to.exist;
  });

  it('should handle screen sharing errors gracefully', () => {
    // Mock the getDisplayMedia function
    const mockGetDisplayMedia = async () => {
      throw new Error('Permission denied');
    };
    
    navigator.mediaDevices.getDisplayMedia = mockGetDisplayMedia;
    
    // Test error handling
    return navigator.mediaDevices.getDisplayMedia()
      .catch(error => {
        expect(error.message).to.equal('Permission denied');
      });
  });
}); 